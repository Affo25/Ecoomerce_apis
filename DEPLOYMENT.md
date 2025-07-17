# Vercel Deployment Guide

## Fixing the Serverless Function Crash

Your serverless function is crashing due to missing environment variables and configuration issues. Follow these steps to fix it:

### 1. Set Environment Variables in Vercel

You need to set these environment variables in your Vercel project:

1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add the following variables:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-jwt-key-here
NODE_ENV=production
```

**Important:** Replace the MongoDB URI with your actual MongoDB connection string.

### 2. Update CORS Configuration

In `server/server.js`, update the CORS origin to match your frontend domain:

```javascript
app.use(cors({ 
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-actual-frontend-domain.vercel.app'] // Replace with your actual domain
    : ['http://localhost:3000'], 
  credentials: true 
}));
```

### 3. Test the Deployment

After setting the environment variables:

1. Redeploy your project in Vercel
2. Test the health endpoint: `https://your-api-domain.vercel.app/api/health`
3. Check the Vercel function logs for any remaining errors

### 4. Common Issues and Solutions

#### MongoDB Connection Issues
- Ensure your MongoDB Atlas cluster allows connections from anywhere (0.0.0.0/0)
- Check that your connection string is correct
- Verify your MongoDB user has the right permissions

#### JWT Secret Issues
- Make sure JWT_SECRET is set and is a strong, random string
- Don't use the default fallback value in production

#### CORS Issues
- Update the origin to match your actual frontend domain
- Include both http and https versions if needed

### 5. Environment Variables Template

Create a `.env` file locally for development:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-jwt-key-here
NODE_ENV=development
PORT=5000
```

### 6. Testing Locally

Before deploying, test locally:

```bash
cd server
npm install
npm run dev
```

Then test the health endpoint: `http://localhost:5000/api/health`

### 7. Vercel Function Logs

If you still have issues, check the Vercel function logs:

1. Go to your Vercel dashboard
2. Select your project
3. Go to Functions tab
4. Click on the function that's failing
5. Check the logs for specific error messages

### 8. Additional Configuration

The updated `vercel.json` includes:
- Better routing for API endpoints
- Increased function timeout (30 seconds)
- Production environment setting

This should resolve the serverless function crash. If you continue to have issues, check the Vercel function logs for specific error messages. 