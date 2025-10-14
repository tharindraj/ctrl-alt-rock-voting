# Deploy to Netlify (Frontend) + Railway (Backend)

## 🎯 FREE Deployment Plan
- **Frontend**: Netlify (FREE forever)
- **Backend**: Railway ($5 credit = ~1 month FREE)
- **Total**: FREE for first month, then $5/month for backend

---

## 📋 Step-by-Step Deployment

### Step 1: Deploy Backend to Railway (FREE with $5 credit)

1. **Go to [Railway.app](https://railway.app)**
2. **Sign up with GitHub**
3. **Click "New Project" → "Deploy from GitHub repo"**
4. **Select your repository**
5. **Railway auto-detects and deploys the backend!**

#### Add Environment Variables in Railway:
Go to your project → Variables tab and add:
```
NODE_ENV=production
PORT=5000
JWT_SECRET=your-super-secure-random-string-here
FROM_EMAIL=your-email@gmail.com
FROM_NAME=CTRL ALT ROCK Voting
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
CLIENT_URL=https://your-netlify-site.netlify.app
```

**You'll get a backend URL like:** `https://your-app.up.railway.app`

---

### Step 2: Deploy Frontend to Netlify (FREE)

1. **Go to [Netlify.com](https://netlify.com)**
2. **Sign up with GitHub**
3. **Click "New site from Git" → Connect to GitHub**
4. **Select your repository**
5. **Build Settings:**
   - **Base directory**: `client`
   - **Build command**: `npm run build`
   - **Publish directory**: `client/build`
6. **Deploy site**

#### Add Environment Variable in Netlify:
Go to Site settings → Environment variables:
```
REACT_APP_API_URL=https://your-railway-backend.up.railway.app
```

**You'll get a frontend URL like:** `https://amazing-site-name.netlify.app`

---

### Step 3: Update Railway Backend URL
Go back to Railway and update the CLIENT_URL variable:
```
CLIENT_URL=https://your-actual-netlify-site.netlify.app
```

---

## 🎉 Share with Friends!

**Send your friends the Netlify URL:**
`https://your-netlify-site.netlify.app`

They can:
- Vote as audience members
- Admins can manage the competition
- Judges can score contestants

---

## 📧 Gmail App Password Setup

To enable email notifications:

1. **Go to Google Account settings**
2. **Security → 2-Step Verification** (enable if not enabled)
3. **App passwords → Generate app password**
4. **Use this password in EMAIL_PASS variable**

---

## 💡 Why This Setup is Great

- **Netlify**: Best performance for React apps, FREE forever
- **Railway**: Super easy backend deployment, generous free tier
- **Separate deployments**: Frontend deploys instantly, backend scales independently
- **Custom domains**: Both support custom domains later

---

## 🛠️ Quick Commands Reference

### Test locally before deploying:
```bash
# Build React app
cd client && npm run build

# Test production mode
cd .. && npm start
```

### If you need to redeploy:
- **Netlify**: Auto-deploys on Git push
- **Railway**: Auto-deploys on Git push

---

Ready to start? Let's deploy the backend to Railway first!