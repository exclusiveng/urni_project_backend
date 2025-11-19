import "reflect-metadata";
import { AppDataSource } from "../../database/data-source";
import { User, UserRole } from "../../src/entities/User";
import * as bcrypt from "bcryptjs";

const createCeo = async () => {
  console.log("Initializing data source...");
  await AppDataSource.initialize();
  console.log("Data source initialized.");

  const userRepo = AppDataSource.getRepository(User);

  const ceoEmail = process.env.CEO_EMAIL || "ceo@urnischedule.com";
  const ceoPassword = process.env.CEO_PASSWORD || "password123";
  const ceoName = "Chief Executive Officer";

  try {
    // 1. Check if a CEO already exists
    const existingCeo = await userRepo.findOne({ where: { role: UserRole.CEO } });
    if (existingCeo) {
      console.log(`A CEO account already exists with email: ${existingCeo.email}. Aborting.`);
      return;
    }

    // 2. Hash the password
    console.log("Hashing password...");
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(ceoPassword, salt);

    // 3. Create the new CEO user
    console.log(`Creating CEO account for ${ceoEmail}...`);
    const ceo = userRepo.create({
      name: ceoName,
      email: ceoEmail,
      password: hashedPassword,
      role: UserRole.CEO,
      is_active: true, // Ensure the CEO is active by default
      // The 'reports_to_id' will be null by default, which is correct for a CEO
    });

    // 4. Save the user to the database
    await userRepo.save(ceo);

    console.log("✅ CEO account created successfully!");
    console.log(`   Email: ${ceoEmail}`);
    console.log(`   Password: ${ceoPassword} (Please change this in a secure environment)`);

  } catch (error) {
    console.error("❌ Error creating CEO account:", error);
  } finally {
    console.log("Closing data source connection...");
    await AppDataSource.destroy();
  }
};

createCeo();