import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { auth } from '@/lib/firebase';
import { fetchSignInMethodsForEmail } from 'firebase/auth';
import { getAuth } from 'firebase-admin/auth';
import { adminApp } from '@/lib/firebase-admin';
import redis from '@/lib/redis';

// Create a transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// Initialize Firebase Admin Auth
const adminAuth = getAuth(adminApp);

// Generate a 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Check if account exists using Firebase Admin SDK
async function checkAccountExists(email: string) {
  try {
    // First try using fetchSignInMethodsForEmail
    const methods = await fetchSignInMethodsForEmail(auth, email);
    if (methods.length > 0) {
      return true;
    }

    // If no methods found, try using Admin SDK
    try {
      const userRecord = await adminAuth.getUserByEmail(email);
      return true;
    } catch (adminError: any) {
      if (adminError?.code === 'auth/user-not-found') {
        return false;
      }
      // For any other error, assume user exists to be safe
      return true;
    }
  } catch (error) {
    // If there's any error in the main try block, assume user exists to be safe
    return true;
  }
}

export async function POST(request: Request) {
  try {
    const { email, type = 'signup' } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    let shouldSendOTP = true;

    // For password reset, check if account exists but always proceed
    if (type === 'password-reset') {
      try {
        const accountExists = await checkAccountExists(email);
        shouldSendOTP = accountExists;
      } catch (error) {
        // If there's an error checking Firebase, we'll still try to send the OTP
        shouldSendOTP = true;
      }
    }

    // Generate OTP
    const otp = generateOTP();
    
    if (shouldSendOTP) {
      // Store OTP in Redis with 5-minute expiration
      const key = `otp:${email}`;
      
      try {
        await redis.set(key, otp, 'EX', 300);
        
        // Verify the OTP was stored
        const storedOTP = await redis.get(key);

        if (!storedOTP || storedOTP !== otp) {
          throw new Error('Failed to store OTP in Redis');
        }
      } catch (error) {
        throw new Error('Failed to store OTP. Please try again.');
      }

      // Send email with appropriate message based on type
      const subject = type === 'password-reset' 
        ? 'Reset Your PDF Culture Password'
        : 'Verify Your PDF Culture Email';

      const message = type === 'password-reset'
        ? 'To reset your password, enter this verification code:'
        : 'To verify your email address, enter this verification code:';

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">PDF Culture</h2>
            <p>${message}</p>
            <h1 style="color: #4F46E5; font-size: 32px; letter-spacing: 5px; text-align: center; padding: 20px; background-color: #F3F4F6; border-radius: 8px;">${otp}</h1>
            <p>This code will expire in 5 minutes.</p>
            <p>If you didn't request this code, please ignore this email.</p>
          </div>
        `,
      });
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to send OTP' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return NextResponse.json(
        { error: 'Email and OTP are required' },
        { status: 400 }
      );
    }

    try {
      // Get OTP from Redis
      const key = `otp:${email}`;
      const storedOTP = await redis.get(key);
      
      if (!storedOTP) {
        return NextResponse.json(
          { error: 'No OTP found for this email or OTP has expired' },
          { status: 400 }
        );
      }

      if (storedOTP !== otp) {
        return NextResponse.json(
          { error: 'Invalid OTP' },
          { status: 400 }
        );
      }

      // Delete the OTP after successful verification
      await redis.del(key);

      return NextResponse.json({ success: true });
    } catch (error) {
      throw new Error('Failed to verify OTP. Please try again.');
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to verify OTP' },
      { status: 500 }
    );
  }
} 