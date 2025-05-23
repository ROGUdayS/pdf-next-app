import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import Redis from 'ioredis';

// Initialize Redis client
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Create a transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// Generate a 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP in Redis with 5-minute expiration
    await redis.set(`otp:${email}`, otp, 'EX', 300); // 300 seconds = 5 minutes

    // Send email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your PDF Culture Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Welcome to PDF Culture!</h2>
          <p>Your verification code is:</p>
          <h1 style="color: #4F46E5; font-size: 32px; letter-spacing: 5px; text-align: center; padding: 20px; background-color: #F3F4F6; border-radius: 8px;">${otp}</h1>
          <p>This code will expire in 5 minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending OTP:', error);
    return NextResponse.json(
      { error: 'Failed to send OTP' },
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

    // Get OTP from Redis
    const storedOTP = await redis.get(`otp:${email}`);
    
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
    await redis.del(`otp:${email}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return NextResponse.json(
      { error: 'Failed to verify OTP' },
      { status: 500 }
    );
  }
} 