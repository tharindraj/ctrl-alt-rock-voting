const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const dataManager = require('./dataManager');

class NotificationService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  async initializeTransporter() {
    try {
      // Load email settings from the database
      const settings = await dataManager.readData('settings');
      const emailSettings = settings.emailSettings || {};
      
      // Use saved settings if available, otherwise use environment variables as fallback
      this.transporter = nodemailer.createTransport({
        host: emailSettings.smtpHost || process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: emailSettings.smtpPort || process.env.EMAIL_PORT || 587,
        secure: (emailSettings.smtpPort || process.env.EMAIL_PORT || 587) === 465,
        pool: true, // Enable connection pooling
        maxConnections: 3, // Limit concurrent connections
        maxMessages: 10, // Limit messages per connection
        rateDelta: 1000, // 1 second
        rateLimit: 1, // Max 1 email per second
        auth: {
          user: emailSettings.smtpUser || process.env.EMAIL_USER || 'your-email@gmail.com',
          pass: emailSettings.smtpPassword || process.env.EMAIL_PASS || 'your-app-password'
        }
      });
      
      console.log('Email transporter initialized with settings:', {
        host: emailSettings.smtpHost || 'fallback',
        port: emailSettings.smtpPort || 'fallback',
        user: emailSettings.smtpUser || 'fallback'
      });
    } catch (error) {
      console.error('Error initializing email transporter:', error);
      // Fallback to environment variables
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: false,
        pool: true,
        maxConnections: 3,
        maxMessages: 10,
        rateDelta: 1000,
        rateLimit: 1,
        auth: {
          user: process.env.EMAIL_USER || 'your-email@gmail.com',
          pass: process.env.EMAIL_PASS || 'your-app-password'
        }
      });
    }
  }

  async refreshTransporter() {
    // Method to refresh transporter when settings are updated
    await this.initializeTransporter();
  }

  async sendLoginCode(email, loginCode, recipientName = '') {
    try {
      // Ensure transporter is initialized
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      // Load email settings for "from" information
      let fromEmail = process.env.EMAIL_USER || 'noreply@ctrlaltrock.com';
      let fromName = 'CTRL + ALT + ROCK';
      
      try {
        const settings = await dataManager.readData('settings');
        if (settings.emailSettings) {
          fromEmail = settings.emailSettings.fromEmail || fromEmail;
          fromName = settings.emailSettings.fromName || fromName;
        }
      } catch (settingsError) {
        console.log('Using default email settings');
      }

      // Generate QR code for auto-login
      const qrResult = await this.generateQRCode(loginCode);
      const qrCodeImg = qrResult.success ? qrResult.qrCode : '';

      const mailOptions = {
        from: `${fromName} <${fromEmail}>`,
        to: email,
        subject: 'CTRL + ALT + ROCK - Your Voting Login Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center;">
              <h1>🎸 CTRL + ALT + ROCK 🎸</h1>
              <p>Your voting access is ready!</p>
            </div>
            <div style="padding: 20px; background-color: #f9f9f9;">
              <h2>Hello ${recipientName}!</h2>
              <p>Welcome to the CTRL + ALT + ROCK voting system!</p>
              
              <div style="display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap;">
                <!-- Login Code Section -->
                <div style="flex: 1; min-width: 250px; background-color: white; border: 2px solid #667eea; border-radius: 10px; padding: 15px; text-align: center;">
                  <h3>Your Login Code</h3>
                  <div style="font-size: 24px; font-weight: bold; color: #667eea; letter-spacing: 3px;">
                    ${loginCode}
                  </div>
                  <p style="margin-top: 10px; font-size: 14px; color: #666;">Enter this code manually</p>
                </div>
                
                <!-- QR Code Section -->
                ${qrCodeImg ? `
                <div style="flex: 1; min-width: 200px; background-color: white; border: 2px solid #667eea; border-radius: 10px; padding: 15px; text-align: center;">
                  <h3>Quick Login QR Code</h3>
                  <img src="${qrCodeImg}" alt="QR Code for Login" style="width: 150px; height: 150px; margin: 10px 0;" />
                  <p style="margin-top: 10px; font-size: 14px; color: #666;">Scan with your phone camera</p>
                </div>
                ` : ''}
              </div>
              
              <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4 style="margin: 0 0 10px 0; color: #1976d2;">📱 Two Easy Ways to Login:</h4>
                <ol style="margin: 0; padding-left: 20px;">
                  <li><strong>Scan QR Code:</strong> Use your phone camera to scan the QR code above for instant login</li>
                  <li><strong>Manual Entry:</strong> Go to the voting website and enter your login code</li>
                </ol>
              </div>
              
              <p>Use this access to vote for your favorite contestants in both Band and Singing categories!</p>
              <p style="color: #666; font-size: 12px;">This code is unique to you. Please don't share it with others.</p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Email send error:', error);
      return { success: false, error: error.message };
    }
  }

  async generateQRCode(loginCode) {
    try {
      // Generate URL for auto-login
      const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      const autoLoginUrl = `${baseUrl}/audience/login?code=${loginCode}`;
      
      // Generate QR code as base64 string with the auto-login URL
      const qrCodeDataURL = await QRCode.toDataURL(autoLoginUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: '#667eea',
          light: '#ffffff'
        }
      });
      
      return { success: true, qrCode: qrCodeDataURL };
    } catch (error) {
      console.error('QR code generation error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendAudienceLogin(member) {
    try {
      // Ensure transporter is initialized
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const fullName = `${member.firstName} ${member.lastName}`;
      
      // Load email settings for "from" information
      let fromEmail = process.env.EMAIL_USER || 'noreply@ctrlaltrock.com';
      let fromName = 'CTRL + ALT + ROCK';
      
      try {
        const settings = await dataManager.readData('settings');
        if (settings.emailSettings) {
          fromEmail = settings.emailSettings.fromEmail || fromEmail;
          fromName = settings.emailSettings.fromName || fromName;
        }
      } catch (settingsError) {
        console.log('Using default email settings');
      }

      // Generate QR code for auto-login
      const qrResult = await this.generateQRCode(member.loginCode);
      const qrCodeImg = qrResult.success ? qrResult.qrCode : '';
      
      const mailOptions = {
        from: `${fromName} <${fromEmail}>`,
        to: member.email,
        subject: 'CTRL + ALT + ROCK - Your Voting Access Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center;">
              <h1>🎸 CTRL + ALT + ROCK 🎸</h1>
              <p>Welcome to the Music Competition!</p>
            </div>
            <div style="padding: 20px; background-color: #f9f9f9;">
              <h2>Hello ${fullName}!</h2>
              <p>You're all set to vote in the CTRL + ALT + ROCK competition!</p>
              
              <div style="display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap;">
                <!-- Login Code Section -->
                <div style="flex: 1; min-width: 250px; background-color: white; border: 2px solid #667eea; border-radius: 10px; padding: 20px; text-align: center;">
                  <h3 style="color: #667eea; margin-top: 0;">Your Login Code</h3>
                  <div style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 4px; margin: 15px 0;">
                    ${member.loginCode}
                  </div>
                  <p style="color: #666; margin-bottom: 0; font-size: 14px;">Enter this code manually</p>
                </div>
                
                <!-- QR Code Section -->
                ${qrCodeImg ? `
                <div style="flex: 1; min-width: 200px; background-color: white; border: 2px solid #667eea; border-radius: 10px; padding: 20px; text-align: center;">
                  <h3 style="color: #667eea; margin-top: 0;">Quick Login QR Code</h3>
                  <img src="${qrCodeImg}" alt="QR Code for Login" style="width: 150px; height: 150px; margin: 10px 0;" />
                  <p style="color: #666; margin-bottom: 0; font-size: 14px;">Scan with your phone camera</p>
                </div>
                ` : ''}
              </div>
              
              <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4 style="margin: 0 0 10px 0; color: #1976d2;">📱 Two Easy Ways to Login:</h4>
                <ol style="margin: 0; padding-left: 20px; color: #333; line-height: 1.6;">
                  <li><strong>Scan QR Code:</strong> Use your phone camera to scan the QR code above for instant login</li>
                  <li><strong>Manual Entry:</strong> Visit the voting website, choose "Audience Login", and enter your code</li>
                </ol>
              </div>
              
              <div style="margin: 20px 0;">
                <h4 style="color: #667eea;">What You Can Vote For:</h4>
                <ul style="color: #333; line-height: 1.6;">
                  <li>🎸 <strong>Band Categories:</strong> Vote for your favorite bands</li>
                  <li>🎤 <strong>Singing Categories:</strong> Choose the best vocal performances</li>
                  <li>🏆 <strong>Special Awards:</strong> Help decide the winners!</li>
                </ul>
              </div>
              
              <div style="background-color: #e8f2ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #333;"><strong>Important:</strong> This code is unique to you and allows you to participate in the voting. Please keep it secure and don't share with others.</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <p style="color: #667eea; font-weight: bold; font-size: 18px;">🎵 Let's rock the vote! 🎵</p>
              </div>
            </div>
            
            <div style="background-color: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
              <p style="margin: 0;">CTRL + ALT + ROCK Music Competition</p>
              <p style="margin: 5px 0 0 0; color: #ccc;">This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Audience email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Audience email send error:', error);
      return { success: false, error: error.message };
    }
  }

  // Send admin credentials
  async sendAdminCredentials(admin, generatedPassword) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const settings = await dataManager.readData('settings');
      const emailSettings = settings.emailSettings || {};
      
      const fromEmail = emailSettings.fromEmail || process.env.FROM_EMAIL || 'noreply@votingapp.com';
      const fromName = emailSettings.fromName || process.env.FROM_NAME || 'Voting System';

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: admin.email,
        subject: '🎸 Admin Account Created - CTRL + ALT + ROCK Voting System',
        html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 15px; overflow: hidden;">
          
          <!-- Header -->
          <div style="text-align: center; padding: 2rem; background: rgba(255,255,255,0.1);">
            <h1 style="margin: 0; font-size: 2rem; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">🎸 CTRL + ALT + ROCK</h1>
            <p style="margin: 0.5rem 0 0 0; opacity: 0.9; font-size: 1.1rem;">Admin Account Created</p>
          </div>

          <!-- Main Content -->
          <div style="padding: 2rem; background: white; color: #333; margin: 1rem;">
            
            <div style="text-align: center; margin-bottom: 2rem;">
              <div style="background: #28a745; color: white; width: 60px; height: 60px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 1.8rem; margin-bottom: 1rem;">
                👤
              </div>
              <h2 style="margin: 0; color: #333;">Welcome ${admin.firstName}!</h2>
              <p style="color: #666; margin: 0.5rem 0;">Your admin account has been created successfully</p>
            </div>

            <!-- Credentials Box -->
            <div style="background: #f8f9fa; border: 2px solid #28a745; border-radius: 12px; padding: 1.5rem; margin: 1.5rem 0;">
              <h3 style="margin: 0 0 1rem 0; color: #28a745; text-align: center;">🔐 Your Login Credentials</h3>
              
              <div style="background: white; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; border: 1px solid #e9ecef;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                  <strong style="color: #495057;">Username:</strong>
                  <code style="background: #e9ecef; padding: 0.25rem 0.5rem; border-radius: 4px; font-family: monospace;">${admin.username}</code>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong style="color: #495057;">Password:</strong>
                  <code style="background: #e9ecef; padding: 0.25rem 0.5rem; border-radius: 4px; font-family: monospace;">${generatedPassword}</code>
                </div>
              </div>

              <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 1rem; margin-top: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                  <span style="font-size: 1.2rem;">⚠️</span>
                  <strong style="color: #856404;">Security Notice</strong>
                </div>
                <p style="margin: 0; color: #856404; font-size: 0.9rem;">
                  Please change your password after your first login for security purposes.
                </p>
              </div>
            </div>

            <!-- Login Instructions -->
            <div style="text-align: center; margin: 2rem 0;">
              <p style="margin-bottom: 1rem; color: #666;">Click the button below to access the admin dashboard:</p>
              <a href="${process.env.CLIENT_URL || 'http://localhost:3001'}/admin" 
                 style="display: inline-block; background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 0.75rem 2rem; text-decoration: none; border-radius: 50px; font-weight: 600; box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);">
                🚀 Access Admin Dashboard
              </a>
            </div>

            <!-- Features List -->
            <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #e9ecef;">
              <h4 style="margin: 0 0 1rem 0; color: #495057;">🎛️ Admin Features Available:</h4>
              <ul style="margin: 0; padding-left: 1.5rem; color: #666;">
                <li style="margin-bottom: 0.5rem;">Manage categories and contestants</li>
                <li style="margin-bottom: 0.5rem;">Configure judges and scoring criteria</li>
                <li style="margin-bottom: 0.5rem;">Monitor audience voting</li>
                <li style="margin-bottom: 0.5rem;">View real-time results</li>
                <li style="margin-bottom: 0.5rem;">System settings and configuration</li>
              </ul>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; padding: 1.5rem; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8);">
            <p style="margin: 0; font-size: 0.9rem;">
              If you have any questions, please contact the system administrator.
            </p>
          </div>
        </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Admin credentials email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
      
    } catch (error) {
      console.error('Admin credentials email send error:', error);
      return { success: false, error: error.message };
    }
  }

  // Test email connection
  async testEmailConnection() {
    try {
      await this.transporter.verify();
      return { success: true, message: 'Email service is ready' };
    } catch (error) {
      console.error('Email connection test failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new NotificationService();