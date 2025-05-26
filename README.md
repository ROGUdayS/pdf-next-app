# PDF Sharing Application

A modern, secure PDF sharing platform built with Next.js, Firebase, and TypeScript. This application allows users to upload, share, and manage PDF documents with granular permission controls.

## Features

### 🔐 Authentication & Security

- Firebase Authentication with email/password
- Secure OTP-based email verification
- Protected routes and API endpoints
- Granular access control system

### 📄 PDF Management

- Upload and store PDFs securely in Firebase Storage
- Automatic thumbnail generation
- File size and type validation
- Real-time document management

### 🔗 Advanced Sharing System

- **Public Link Sharing**: Create shareable links for public access
- **Email-based Sharing**: Share with specific users via email
- **Per-user Permissions**: Individual save/download permissions
- **Access Management**: View and manage all users with access
- **Saved Copy Detection**: Track which users have saved copies

### 👥 User Experience

- Responsive design with dark mode support
- Real-time updates using Firebase listeners
- Intuitive sharing interface with tabbed management
- Clear permission indicators and status messages
- Comprehensive access control feedback

## PDF Sharing Mechanism

### Sharing Methods

#### 1. Public Link Sharing

```typescript
// Enable public access via shareable link
{
  isPubliclyShared: true,
  allowSave: boolean // Global permission for public users
}
```

- Anyone with the link can access the PDF
- Global permission setting applies to all public users
- Can be enabled/disabled by the owner

#### 2. Email-based Sharing

```typescript
// Add specific users with individual permissions
accessUsers: [
  {
    email: "user@example.com",
    canSave: boolean, // Individual permission
    addedAt: Date,
  },
];
```

- Share with specific email addresses
- Individual permission control per user
- Email notifications sent to shared users

### Permission Levels

#### For Non-authenticated Users

- **Public PDFs**: View-only access, must login to save/download
- **Private PDFs**: No access (redirected to login)

#### For Authenticated Users

- **View Only** (`canSave: false`): Can view but cannot download, save, or open in new tab
- **Full Access** (`canSave: true`): Can view, download, save to collection, and open in new tab
- **Owner**: Full control including sharing, deleting, and permission management

### Access Control Logic

```typescript
// Access determination hierarchy
const hasAccess =
  isOwner || // PDF owner has full access
  hasExplicitAccess || // User in accessUsers array
  (isPubliclyShared && !requiresAuth); // Public access when enabled
```

### Saved Copies vs Shared Access

#### Shared PDF Access (`/shared/[id]`)

- Controlled by `accessUsers` array and `isPubliclyShared` flag
- Can be revoked by the owner
- Real-time access control

#### Saved Copies (User's Collection)

- Independent documents with `ownerId: user.uid`
- User has full ownership and control
- Cannot be revoked by original owner
- Appears in user's personal dashboard

### Share Dialog Interface

#### Share Tab

- **Default Permissions**: Set global permissions for new shares
- **Email Sharing**: Add users with individual permissions
- **Public Link Management**: Enable/disable public access
- **Permission Preview**: Shows what permissions will be applied

#### Manage Access Tab

- **User List**: View all users with access
- **Permission Toggles**: Change individual user permissions
- **Saved Copy Indicators**: Shows which users have saved copies
- **Access Revocation**: Remove user access with clear implications
- **Public Link Status**: Overview of public sharing settings

### Security Features

1. **Firebase Rules**: Server-side access control enforcement
2. **Real-time Validation**: Immediate access checks on page load
3. **Audit Trail**: Track when users are added/removed
4. **Clear Feedback**: Users understand their permission level
5. **Graceful Degradation**: Appropriate fallbacks for unauthorized access

### User Experience Flow

1. **Owner uploads PDF** → Document created with owner permissions
2. **Owner shares PDF** → Users added to accessUsers or public link enabled
3. **Users access PDF** → Permission level determined and UI adapted
4. **Users save PDF** → Independent copy created in user's collection
5. **Owner manages access** → Real-time permission updates
6. **Access revoked** → User loses shared access, retains saved copies

## Technical Architecture

### Tech Stack

- **Frontend**: Next.js 14 with App Router, TypeScript, Tailwind CSS
- **Backend**: Firebase (Firestore, Storage, Authentication)
- **UI Components**: Headless UI, React components
- **Email Service**: Nodemailer with Gmail SMTP
- **Caching**: Redis for OTP storage
- **Deployment**: Netlify

### Project Structure

```
app/
├── components/           # Reusable UI components
│   ├── PDFViewer.tsx    # PDF display component
│   ├── ShareDialog.tsx  # Sharing interface
│   └── ...
├── dashboard/           # Protected dashboard pages
│   └── pdfs/           # PDF management interface
├── shared/             # Public PDF sharing pages
│   └── [id]/          # Dynamic shared PDF routes
├── api/               # API routes
│   ├── send-email/    # Email notification endpoint
│   └── ...
├── lib/               # Utility libraries
│   ├── firebase.ts    # Firebase configuration
│   └── ...
└── globals.css        # Global styles

firestore.rules         # Firestore security rules
storage.rules          # Firebase Storage security rules
ACCESS_CONTROL.md      # Detailed access control documentation
```

### Key Components

#### ShareDialog Component

- Tabbed interface for sharing and access management
- Real-time user permission management
- Saved copy detection and indicators
- Public link management with permission controls

#### PDFViewer Component

- Secure PDF rendering with permission-based controls
- Download/save restrictions based on user permissions
- Integration with sharing and access control systems

#### Shared PDF Page (`/shared/[id]`)

- Dynamic access control validation
- Permission-based UI adaptation
- Real-time access checking and user feedback

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment Variables

For production deployment, make sure to set the following environment variables:

### Required Firebase Configuration

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

### Required for Email Functionality

- `EMAIL_USER` - Gmail address for sending emails
- `EMAIL_APP_PASSWORD` - Gmail app password

### Required for Production URLs

- `NEXT_PUBLIC_BASE_URL` - Set to `https://pdf-culture.netlify.app` for production

### Firebase Admin (for server-side operations)

- `FIREBASE_PRIVATE_KEY_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_CLIENT_ID`
- `FIREBASE_AUTH_URI`
- `FIREBASE_TOKEN_URI`
- `FIREBASE_AUTH_PROVIDER_X509_CERT_URL`
- `FIREBASE_CERT_URL`

### Redis (for OTP storage)

- `REDIS_URL`

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Firebase Configuration

### Firestore Security Rules

The application uses comprehensive Firestore rules to ensure data security:

```javascript
// Allow read access to PDFs for authenticated and non-authenticated users
// Write access restricted to owners and authorized users
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /pdfs/{document} {
      allow read: if true; // Public read for sharing functionality
      allow write: if request.auth != null &&
        (request.auth.uid == resource.data.ownerId ||
         request.auth.token.email in resource.data.accessUsers);
    }
  }
}
```

### Storage Security Rules

Firebase Storage rules control file access:

```javascript
// Allow read access to PDF files and thumbnails
// Write access restricted to authenticated users
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /pdfs/{allPaths=**} {
      allow read: if true; // Public read for sharing
      allow write: if request.auth != null;
    }
  }
}
```

## API Endpoints

### `/api/send-email`

- **Method**: POST
- **Purpose**: Send email notifications for PDF sharing
- **Authentication**: Required
- **Payload**:
  ```typescript
  {
    to: string;
    subject: string;
    pdfName: string;
    shareUrl: string;
    senderName: string;
  }
  ```

## Deployment

### Current Deployment

- **Platform**: Netlify
- **URL**: `https://pdf-culture.netlify.app`
- **Build Command**: `npm run build`
- **Environment**: Production environment variables configured

### Alternative Deployment Options

#### Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

#### Manual Deployment

1. Set up all required environment variables
2. Configure Firebase project and rules
3. Build the application: `npm run build`
4. Deploy to your preferred hosting platform

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Development

### Local Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see Environment Variables section)
4. Configure Firebase project
5. Run development server: `npm run dev`

### Testing the Sharing System

1. Upload a PDF to your dashboard
2. Use the Share button to test different sharing methods
3. Test access control by sharing with different permission levels
4. Verify email notifications are working
5. Test public link sharing and access revocation

## Contributing

When contributing to the sharing system:

1. Ensure all permission checks are implemented both client and server-side
2. Test access control thoroughly with different user scenarios
3. Update documentation for any new sharing features
4. Follow the established patterns for UI feedback and error handling
