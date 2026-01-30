const axios = require('axios');
const { io } = require('socket.io-client');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function registerOrLogin(email, name, password) {
  try {
    const res = await axios.post(`${BASE}/api/auth/register`, {
      name,
      email,
      password,
    });
    return { token: res.data.token, user: res.data.data.user };
  } catch (err) {
    if (err.response && err.response.status === 400 && err.response.data.message === 'User already exists') {
      const li = await axios.post(`${BASE}/api/auth/login`, { email, password });
      return { token: li.data.token, user: li.data.data.user };
    }
    throw err;
  }
}

(async () => {
  console.log('[smoke] Starting notification smoke test against', BASE);

  const emailA = `smoke.receiver+${Date.now()}@example.com`;
  const emailB = `smoke.sender+${Date.now()}@example.com`;
  const pwd = 'P@ssw0rd123';

  try {
    const a = await registerOrLogin(emailA, 'Smoke Receiver', pwd);
    console.log('[smoke] Receiver ready', a.user.id);

    const b = await registerOrLogin(emailB, 'Smoke Sender', pwd);
    console.log('[smoke] Sender ready', b.user.id);

    // Connect socket for receiver
    const socket = io(BASE, {
      auth: { token: `Bearer ${a.token}` },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      timeout: 5000,
    });

    let gotMessage = false;
    let gotNotification = false;

    socket.on('connect', () => {
      console.log('[smoke] socket connected as receiver', socket.id);
    });

    socket.on('new_message', (msg) => {
      console.log('[smoke] new_message event received:', msg.id);
      gotMessage = true;
    });

    socket.on('notification', (n) => {
      console.log('[smoke] notification event received:', n.id, n.title);
      gotNotification = true;
    });

    socket.on('connect_error', (err) => {
      console.error('[smoke] socket connect_error', err.message);
    });

    // Wait a bit for socket to connect
    await sleep(1200);

    // Send a message as sender
    const sendRes = await axios.post(`${BASE}/api/messages`, {
      receiver_id: a.user.id,
      content: 'Hello from smoke test'
    }, {
      headers: { Authorization: `Bearer ${b.token}` }
    });

    console.log('[smoke] Message created:', sendRes.data.data.id || sendRes.data.data?.id || 'created');

    // Wait for events for up to 5 seconds
    const start = Date.now();
    while (Date.now() - start < 5000) {
      if (gotMessage && gotNotification) break;
      await sleep(200);
    }

    console.log('[smoke] Results -> message:', gotMessage, 'notification:', gotNotification);

    socket.close();

    if (gotMessage && gotNotification) {
      console.log('[smoke] SUCCESS: Both message and notification received.');
      process.exit(0);
    } else {
      console.error('[smoke] FAILED: missing events.');
      process.exit(2);
    }

  } catch (err) {
    console.error('[smoke] Error during smoke test:', (err.response && err.response.data) || err.message || err);
    process.exit(3);
  }
})();
