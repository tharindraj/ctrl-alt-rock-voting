# 🎸 CTRL + ALT + ROCK - Online Voting System

A comprehensive full-stack voting application designed for music competitions and events. Built with React frontend and Node.js backend.

![Voting System](https://img.shields.io/badge/Status-Ready%20for%20Production-success)
![React](https://img.shields.io/badge/React-18+-blue)
![Node.js](https://img.shields.io/badge/Node.js-14+-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## 🌟 Features

### 👥 **Multi-Role System**
- **Admin Dashboard**: Complete management interface
- **Judge Interface**: Professional scoring system  
- **Audience Voting**: Mobile-friendly public voting

### 🎯 **Core Functionality**
- ✅ Real-time voting and scoring
- ✅ Category-based competitions (Band & Singing)
- ✅ Customizable scoring criteria
- ✅ Email notifications with QR codes
- ✅ Image uploads for contestants and categories
- ✅ Comprehensive results dashboard
- ✅ CSV import/export functionality

### 📱 **User Experience**
- ✅ Fully responsive design
- ✅ Mobile-optimized interface
- ✅ QR code based audience access
- ✅ Real-time updates
- ✅ Professional admin interface

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Gmail account (for email notifications)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ctrl-alt-rock-voting.git
   cd ctrl-alt-rock-voting
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

4. **Start the development servers**
   ```bash
   # Terminal 1 - Backend
   npm run server

   # Terminal 2 - Frontend  
   npm run client
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:5000

### Default Login
- **Admin**: `admin` / `admin123`

## 📁 Project Structure

```
ctrl-alt-rock-voting/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── contexts/       # Context providers
│   │   ├── config/         # API configuration
│   │   └── styles/         # CSS styles
│   └── public/             # Static files
├── server/                 # Node.js backend
│   ├── routes/             # API routes
│   ├── middleware/         # Custom middleware
│   ├── utils/              # Utility functions
│   ├── data/               # JSON data storage
│   └── uploads/            # File uploads
├── docs/                   # Documentation
└── deployment/             # Deployment configs
```

## 🛠️ Technology Stack

### Frontend
- **React 18+** - Modern UI framework
- **CSS3** - Custom responsive styling
- **Axios** - HTTP client for API calls
- **Context API** - State management

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **JSON File Storage** - Lightweight data persistence
- **Multer** - File upload handling
- **Nodemailer** - Email notifications
- **QR Code** - QR code generation
- **bcryptjs** - Password hashing
- **JWT** - Authentication tokens

## 🚀 Deployment

Ready for deployment! Choose your preferred option:

### Option 1: Railway (One-click deployment)
- Cost: $5/month after free credit
- Difficulty: ⭐ (Easiest)

### Option 2: Netlify + Railway (Recommended for free tier)
- Cost: FREE frontend + $5/month backend
- Difficulty: ⭐⭐

### Option 3: Render.com (100% Free)
- Cost: FREE with limitations
- Difficulty: ⭐⭐

See detailed deployment guides:
- 📄 [DEPLOYMENT-CHECKLIST.md](./DEPLOYMENT-CHECKLIST.md)
- 📄 [NETLIFY-RAILWAY-DEPLOY.md](./NETLIFY-RAILWAY-DEPLOY.md)

## ⚙️ Configuration

### Environment Variables

#### Backend (.env)
```bash
NODE_ENV=production
PORT=5000
JWT_SECRET=your-secure-jwt-secret
FROM_EMAIL=your-email@gmail.com
FROM_NAME=Your Event Name
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
CLIENT_URL=https://your-frontend-domain.com
```

#### Frontend (Netlify/Vercel)
```bash
REACT_APP_API_URL=https://your-backend-domain.com
```

### Gmail Setup for Notifications
1. Enable 2-Step Verification in Google Account
2. Generate App Password: Account → Security → App passwords
3. Use the app password in EMAIL_PASS

## 🎯 Usage Guide

### For Event Organizers (Admin)
1. **Setup Categories**: Band and Singing competitions
2. **Add Contestants**: Upload photos and details
3. **Configure Judges**: Set up judge accounts and scoring criteria
4. **Generate Audience Access**: Create QR codes for public voting
5. **Monitor Results**: Real-time dashboard with comprehensive analytics

### For Judges
1. **Login**: Use provided credentials
2. **Score Contestants**: Rate based on configured criteria
3. **Submit Scores**: Real-time score submission and validation

### For Audience
1. **Scan QR Code**: Instant access via mobile
2. **Vote**: Simple one-click voting interface  
3. **View Results**: Live results and winner announcements

## 📊 Features in Detail

### Admin Dashboard
- User management (admins, judges)
- Category and contestant management
- Scoring criteria configuration
- Results analytics and export
- Email notification system

### Judge Interface  
- Category-specific scoring criteria
- Weighted scoring system
- Real-time score submission
- Progress tracking

### Audience Experience
- QR code access
- Mobile-optimized voting
- Category browsing
- Live results viewing

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter any issues:

1. Check the [Issues](https://github.com/yourusername/ctrl-alt-rock-voting/issues) page
2. Review the deployment guides in `/docs`
3. Check server logs for backend issues
4. Verify environment variables are correctly set

## 🎉 Acknowledgments

- Built for music competitions and talent shows
- Designed with mobile-first responsive principles  
- Optimized for real-time voting scenarios
- Scalable architecture for various event sizes

---

**Made with ❤️ for the music community**

*Happy voting! 🎸🎤*