# 🚀 Deployment Checklist - Netlify + Railway

## ✅ Pre-Deployment Setup

### 1. Push to GitHub (if not done already)
```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### 2. Get Gmail App Password
- Go to Google Account → Security → 2-Step Verification → App passwords
- Generate password for EMAIL_PASS

---

## 🛤️ Deploy Backend to Railway (Step 1)

1. **Go to [railway.app](https://railway.app)**
2. **Sign up with GitHub**
3. **New Project → Deploy from GitHub repo**
4. **Select your repository**
5. **Wait for deployment** (2-3 minutes)
6. **Copy the deployment URL** (e.g., `https://web-production-abc123.up.railway.app`)

### Add Environment Variables:
- Click **Variables** tab in Railway
- Add variables from `railway-env.txt` file
- **Important**: Update `CLIENT_URL` after you get Netlify URL

---

## 🌐 Deploy Frontend to Netlify (Step 2)

1. **Go to [netlify.com](https://netlify.com)**
2. **Sign up with GitHub**
3. **New site from Git → GitHub**
4. **Select your repository**
5. **Build settings are auto-detected from netlify.toml**
6. **Deploy site** (2-3 minutes)
7. **Copy the deployment URL** (e.g., `https://amazing-app-123.netlify.app`)

### Add Environment Variable:
- Go to **Site settings → Environment variables**
- Add: `REACT_APP_API_URL` = your Railway backend URL
- **Trigger new deploy**

---

## 🔗 Final Configuration

### Update Railway Backend:
1. Go back to Railway Variables
2. Update `CLIENT_URL` = your actual Netlify URL
3. Backend will automatically redeploy

---

## 🎉 Share with Friends!

**Send them your Netlify URL:**
`https://your-actual-netlify-site.netlify.app`

**Login credentials:**
- Admin: `admin` / `admin123`
- Or create new admin users from the admin panel

---

## 🔧 Troubleshooting

**If voting doesn't work:**
1. Check browser console for errors
2. Verify environment variables are set correctly
3. Make sure both sites are using HTTPS
4. Check Railway logs for backend errors

**Need help?**
- Railway: Check deployment logs
- Netlify: Check function logs and build logs
- Both platforms have excellent documentation

---

## 💰 Costs

- **Netlify**: FREE forever
- **Railway**: $5 credit (lasts ~1 month), then $5/month
- **Total first month**: FREE
- **After free credit**: $5/month for backend

Ready to deploy? Start with Railway (backend) first!