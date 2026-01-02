# Deployment Guide for Render

This guide explains how to deploy the Secure Scheduler API to Render.

## Prerequisites

1. A Render account (https://render.com)
2. A PostgreSQL database (you can create one on Render)
3. Your code pushed to a Git repository (GitHub, GitLab, etc.)

## Environment Variables

Set the following environment variables in your Render web service:

```
NODE_ENV=production
PORT=3000
DATABASE_URL=<your-postgres-connection-url>
DATABASE_SSL=true

# JWT Secret
JWT_SECRET=<your-secret-key>

# CORS
CORS_ORIGIN=<your-frontend-url>

# Logging
LOG_LEVEL=info
```

## Render Configuration

### 1. Create PostgreSQL Database

1. Go to your Render dashboard
2. Click "New +" → "PostgreSQL"
3. Fill in the database details
4. Copy the **Internal Database URL** (this will be your `DATABASE_URL`)

### 2. Create Web Service

1. Click "New +" → "Web Service"
2. Connect your Git repository
3. Configure the service:
   - **Name**: `secure-scheduler-api` (or your preferred name)
   - **Environment**: `Node`
   - **Region**: Choose closest to your users
   - **Branch**: `main` (or your deployment branch)
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

### 3. Environment Variables

Add all the environment variables listed above in the "Environment" section.

### 4. Advanced Settings

- **Auto-Deploy**: Enable to automatically deploy on git push
- **Health Check Path**: `/` (the API returns a health check at root)

## Database Schema Management

### Automatic Schema Synchronization (Default - Recommended for Render)

By default, TypeORM will **automatically create and update** your database schema when the application starts. This is the simplest approach for deployment on Render.

**How it works:**
- On first deployment, all tables, indexes, and constraints are created automatically
- On subsequent deployments, schema changes are applied automatically
- No manual migration commands needed

**Note for Production:**
`synchronize` is disabled in production (`NODE_ENV=production`) to prevent data loss. 
You **MUST** use migrations to create the database schema in production.

See the "Using Migrations" section below.

### Using Migrations (Recommended)

Since `synchronize` is disabled in production, you should use migrations:

1. Add this environment variable to Render:
   ```
   RUN_MIGRATIONS=true
   ```

2. Before deploying, generate a migration locally:
   ```bash
   npm run migration:generate src/migrations/YourMigrationName
   ```

3. Commit and push the migration file

4. Deploy to Render - the migration will run automatically

**Migration Commands (Development Only):**
- **Generate migration**: `npm run migration:generate src/migrations/MigrationName`
- **Run migrations**: `npm run migration:run`
- **Revert migration**: `npm run migration:revert`

## Database Schema

The application creates the following tables:
- `branches` - Office/branch locations with GPS coordinates
- `departments` - Company departments
- `users` - User accounts with roles and hierarchy
- `attendances` - Clock in/out records with geofencing
- `leave_requests` - Leave/time-off requests with approval workflow
- `messages` - Internal messaging system
- `tickets` - Issue tracking and whistleblowing system

All tables use UUID primary keys and include proper foreign key constraints.

## Deployment Steps Summary

1. **Create PostgreSQL database** on Render
2. **Create Web Service** and connect your repository
3. **Set environment variables** (especially `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`)
4. **Deploy** - Render will:
   - Install dependencies
   - Build TypeScript code
   - Start the server
   - Auto-create database schema on first run

That's it! Your database schema will be created automatically.

## Troubleshooting

### Database Connection Issues

1. Verify `DATABASE_URL` is set correctly (use Internal Database URL from Render)
2. Ensure `DATABASE_SSL=true` is set for Render PostgreSQL
3. Check that your database is in the same region as your web service

### Build Failures

1. Ensure all dependencies are in `package.json`
2. Check that TypeScript compiles locally: `npm run build`
3. Review Render build logs for specific errors

### Schema Not Created

If tables aren't being created automatically:
1. Check Render logs for database connection errors
2. Verify `NODE_ENV=production` is set
3. Ensure `DATABASE_URL` is correct
4. Check database permissions

## Post-Deployment

### Create CEO Account

After successful deployment, create your first CEO account:

```bash
# Via Render Shell
npm run create:ceo
```

Or use the API endpoint directly.

## Monitoring

- **Logs**: Available in Render dashboard under "Logs" tab
- **Metrics**: Monitor CPU, memory, and request metrics in Render dashboard
- **Health Check**: The root endpoint `/` returns API status

## Scaling

Render allows you to scale your service:
1. Go to your web service settings
2. Adjust the instance type for more resources
3. Enable autoscaling if needed

## Important Notes

- **First deployment** may take 2-3 minutes as the database schema is created
- **Subsequent deployments** are faster
- **Database changes** are applied automatically when you update entities
- **No manual migration commands** needed on Render

## Support

For issues specific to:
- **Render Platform**: https://render.com/docs
- **This Application**: Check application logs and error messages
