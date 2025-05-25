# PDF Culture Application - Complete Documentation

## Overview

PDF Culture is a comprehensive web application built with Next.js 15, React 18, and Firebase that enables users to share, manage, and collaborate on PDF documents. The application provides a secure platform for PDF sharing with features like real-time commenting, user authentication, file management, and collaborative tools.

## Technology Stack

### Frontend

- **Next.js 15.3.2** - React framework with App Router
- **React 18.2.0** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling framework
- **React PDF** - PDF viewing and rendering
- **PDF.js** - PDF processing and thumbnail generation
- **Radix UI** - Accessible UI components
- **Lucide React** - Icon library
- **React Hook Form** - Form management
- **Zod** - Schema validation

### Backend & Services

- **Firebase Authentication** - User authentication
- **Firestore** - NoSQL database
- **Firebase Storage** - File storage
- **Firebase Functions** - Serverless functions
- **Nodemailer** - Email notifications
- **Redis (IORedis)** - OTP storage and caching

### Development Tools

- **ESLint** - Code linting
- **Prisma** - Database ORM (configured but using Firestore)
- **Canvas** - Server-side image processing

## Core Features

### 1. User Authentication & Management

#### Authentication Methods

- **Email/Password Authentication**

  - Sign up with email and password
  - Sign in with existing credentials
  - Password reset functionality via email
  - Email verification system

- **Google OAuth Integration**
  - One-click Google sign-in
  - Automatic profile information import
  - Seamless account linking

#### User Profile Management

- **Profile Photo Upload**

  - Custom photo upload for non-Google users
  - Automatic Google profile photo integration
  - Image validation (max 5MB, image formats only)
  - Secure storage in Firebase Storage

- **Account Security**
  - JWT token-based authentication
  - Secure session management
  - Automatic token refresh
  - Protected route middleware

#### Password Management

- **Forgot Password Flow**
  - OTP-based password reset
  - Email verification
  - Secure token generation
  - Redis-based OTP storage with expiration

### 2. PDF Management System

#### File Upload & Storage

- **Secure PDF Upload**

  - Drag-and-drop interface
  - File validation (PDF only, max 10MB)
  - Progress tracking during upload
  - Automatic thumbnail generation
  - Firebase Storage integration

- **File Organization**
  - User-specific storage buckets
  - Automatic file naming with timestamps
  - Metadata storage in Firestore
  - Thumbnail caching system

#### PDF Viewing & Interaction

- **Advanced PDF Viewer**

  - High-quality PDF rendering using PDF.js
  - Zoom controls (fit to width, fit to page, custom zoom)
  - Page navigation (previous, next, jump to page)
  - Rotation controls (90°, 180°, 270°)
  - Fullscreen mode
  - Side-by-side page viewing
  - Download functionality
  - Print support

- **Responsive Design**
  - Mobile-optimized viewing
  - Touch gesture support
  - Adaptive layout for different screen sizes

#### File Management Operations

- **Rename PDFs**

  - In-place editing
  - Real-time updates
  - Storage path management
  - Thumbnail synchronization

- **Delete PDFs**

  - Confirmation dialogs
  - Complete cleanup (file + thumbnail + metadata)
  - Cascade deletion for shared copies

- **File Information**
  - File size display
  - Upload date and time
  - Owner information
  - Access permissions

### 3. Sharing & Collaboration

#### Email-Based Sharing

- **Direct Email Sharing**

  - Share PDFs via email addresses
  - Customizable access permissions
  - Email notifications with PDF links
  - HTML email templates
  - Permission management (view-only vs. download)

- **Access Control**
  - User-specific access lists
  - Permission levels (view, download, save)
  - Access revocation
  - Real-time permission updates

#### Link-Based Sharing

- **Public Link Generation**
  - Shareable public links
  - Configurable permissions
  - Link-based access control
  - No authentication required for public links

#### Shared PDF Management

- **Shared with Me Section**
  - View all PDFs shared by others
  - Save shared PDFs to personal collection
  - Remove access to shared PDFs
  - Track sharing history

### 4. Real-Time Commenting System

#### Comment Features

- **Rich Text Comments**

  - Bold and italic formatting
  - Bullet point lists
  - HTML content support
  - Real-time comment updates

- **Comment Interactions**
  - Like/unlike comments
  - Reply to comments
  - Nested conversation threads
  - User avatar display

#### Comment Management

- **Moderation Tools**

  - Delete own comments
  - PDF owner can delete any comments
  - Clear all comments (owner only)
  - Real-time comment synchronization

- **User Experience**
  - Automatic user identification
  - Timestamp display
  - Comment formatting preview
  - Responsive comment interface

### 5. Dashboard & Navigation

#### Main Dashboard

- **Overview Statistics**

  - Total owned PDFs count
  - Shared PDFs count
  - Recent activity tracking
  - Quick access links

- **Navigation Structure**
  - My PDFs section
  - Shared with Me section
  - Recent activity feed
  - User profile access

#### PDF Management Interface

- **View Modes**

  - Grid view with thumbnails
  - List view with details
  - Sortable columns
  - Search functionality

- **Filtering & Sorting**
  - Sort by name, date, size, shared by
  - Ascending/descending order
  - Real-time search
  - Filter by file type

### 6. Security & Permissions

#### Data Security

- **Firestore Security Rules**

  - User-based access control
  - PDF ownership validation
  - Comment permission checking
  - Public sharing controls

- **Storage Security Rules**
  - File access validation
  - User directory isolation
  - File type restrictions
  - Size limitations

#### Authentication Security

- **Route Protection**
  - Middleware-based route guarding
  - Automatic redirects for unauthenticated users
  - Session validation
  - Token-based API access

### 7. Email System

#### Notification System

- **Share Notifications**

  - Automated email sending
  - HTML email templates
  - Permission details in emails
  - Direct PDF access links

- **Email Configuration**
  - Gmail SMTP integration
  - App password authentication
  - Error handling and retry logic
  - Template customization

## API Endpoints

### Authentication APIs

- `POST /api/auth/send-otp` - Send OTP for password reset
- `POST /api/auth/reset-password` - Reset password with OTP

### PDF Management APIs

- `GET /api/pdf-proxy` - Secure PDF proxy with authentication
- `POST /api/share-notification` - Send sharing notification emails
- `GET /api/shared-pdf/[id]` - Access shared PDF metadata
- `POST /api/share` - Share PDF with users

### Utility APIs

- `POST /api/test-email` - Test email configuration

## Database Schema

### Firestore Collections

#### PDFs Collection

```typescript
interface PdfDocument {
  id: string;
  name: string;
  url: string;
  uploadedBy: string;
  uploadedAt: Timestamp;
  size: number;
  accessUsers: string[];
  ownerId: string;
  thumbnailUrl?: string;
  thumbnailPath?: string;
  storagePath: string;
  isPubliclyShared?: boolean;
  allowSave: boolean;
  originalPdfId?: string; // For saved copies
}
```

#### Comments Collection

```typescript
interface CommentDocument {
  id: string;
  pdfContentId: string; // Hash of PDF URL
  pdfId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  timestamp: Timestamp;
  formattedText: string;
  likes: string[];
  replies: Reply[];
}
```

## Environment Configuration

### Required Environment Variables

#### Firebase Configuration

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

#### Firebase Admin (Server-side)

```env
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_AUTH_URI=your_auth_uri
FIREBASE_TOKEN_URI=your_token_uri
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=your_cert_url
FIREBASE_CERT_URL=your_cert_url
```

#### Email Configuration

```env
EMAIL_USER=your_gmail_address
EMAIL_APP_PASSWORD=your_gmail_app_password
```

#### Application URLs

```env
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

#### Redis Configuration

```env
REDIS_URL=your_redis_connection_string
```

## Installation & Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Firebase project
- Gmail account for email notifications
- Redis instance (for OTP storage)

### Installation Steps

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd pdf-next-app
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   - Copy `.env.example` to `.env.local`
   - Fill in all required environment variables

4. **Set up Firebase**

   - Create a Firebase project
   - Enable Authentication (Email/Password and Google)
   - Set up Firestore database
   - Configure Firebase Storage
   - Deploy security rules

5. **Configure email service**

   - Enable 2FA on Gmail account
   - Generate app password
   - Add credentials to environment variables

6. **Run the development server**
   ```bash
   npm run dev
   ```

## Usage Guide

### For End Users

#### Getting Started

1. **Sign Up/Sign In**

   - Visit the application homepage
   - Choose between email/password or Google authentication
   - Complete the registration process

2. **Upload Your First PDF**

   - Navigate to "My PDFs" section
   - Click "Upload PDF" or drag and drop files
   - Wait for upload and thumbnail generation

3. **Share a PDF**

   - Open any PDF from your collection
   - Click the "Share" button
   - Choose between email sharing or public link
   - Set appropriate permissions

4. **View Shared PDFs**

   - Access "Shared with Me" section
   - View PDFs shared by others
   - Save interesting PDFs to your collection

5. **Collaborate with Comments**
   - Open any PDF you have access to
   - Click "Comments" to view/add comments
   - Use formatting tools for rich text
   - Reply to existing comments

#### Advanced Features

- **Organize PDFs**: Use search and sorting to manage large collections
- **Download PDFs**: Save PDFs locally (if permissions allow)
- **Manage Sharing**: Control who has access to your PDFs
- **Profile Management**: Update your profile photo and information

### For Administrators

#### User Management

- Monitor user activity through Firebase Console
- Manage user permissions and access
- Handle support requests and issues

#### Content Moderation

- Review reported content
- Manage inappropriate comments
- Monitor storage usage

#### System Maintenance

- Monitor Firebase usage and costs
- Update security rules as needed
- Manage email quotas and delivery

## Security Considerations

### Data Protection

- All PDFs are stored in secure Firebase Storage
- Access control through Firestore security rules
- User authentication required for most operations
- Encrypted data transmission (HTTPS)

### Privacy Features

- User data isolation
- Granular sharing permissions
- Ability to revoke access
- No tracking of user behavior

### Best Practices

- Regular security rule audits
- Monitor for unusual access patterns
- Keep dependencies updated
- Use strong authentication methods

## Performance Optimization

### Frontend Optimizations

- PDF thumbnail caching
- Lazy loading of PDF content
- Optimized image delivery
- Code splitting and bundling

### Backend Optimizations

- Firestore query optimization
- Storage access patterns
- CDN integration for static assets
- Efficient thumbnail generation

## Troubleshooting

### Common Issues

#### Upload Problems

- Check file size (max 10MB)
- Verify PDF format
- Ensure stable internet connection
- Check Firebase Storage quotas

#### Authentication Issues

- Verify environment variables
- Check Firebase project configuration
- Ensure proper domain setup
- Validate email/password requirements

#### Sharing Problems

- Verify email configuration
- Check recipient email addresses
- Ensure proper permissions
- Monitor email delivery logs

#### Performance Issues

- Clear browser cache
- Check network connectivity
- Monitor Firebase usage
- Optimize PDF file sizes

## Future Enhancements

### Planned Features

- Advanced search with full-text indexing
- PDF annotation tools
- Version control for PDFs
- Team/organization management
- Advanced analytics and reporting
- Mobile app development
- Integration with cloud storage providers
- OCR text extraction
- PDF editing capabilities
- Collaborative real-time editing

### Technical Improvements

- Enhanced caching strategies
- Better error handling
- Improved accessibility
- Performance monitoring
- Automated testing suite
- CI/CD pipeline improvements

## Support & Maintenance

### Regular Maintenance Tasks

- Monitor Firebase usage and costs
- Update dependencies
- Review and update security rules
- Backup critical data
- Monitor email delivery rates
- Check for security vulnerabilities

### Support Channels

- GitHub Issues for bug reports
- Documentation updates
- Community forums
- Direct support for critical issues

## Conclusion

PDF Culture provides a comprehensive solution for PDF sharing and collaboration with robust security, user-friendly interface, and powerful features. The application is built with modern web technologies and follows best practices for security, performance, and user experience.

The modular architecture allows for easy maintenance and future enhancements, while the Firebase backend provides scalability and reliability. Whether used for personal document management or team collaboration, PDF Culture offers the tools needed for effective PDF sharing and collaboration.
