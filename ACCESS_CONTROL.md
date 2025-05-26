# PDF Sharing Access Control System

## Overview

This document explains how the PDF sharing and access control system works in the application.

## Access Control Principles

### 1. Shared PDF Access (via `/shared/[id]`)

- **Public Links**: When `isPubliclyShared` is true, anyone with the link can view the PDF
- **Explicit Access**: Users in the `accessUsers` array can view the PDF even if not publicly shared
- **Owner Access**: The PDF owner (matching `ownerId`) always has full access
- **Permission Levels**: Each user can have `canSave: true/false` determining download/save permissions

### 2. Saved PDF Copies

- When a user saves a PDF, a **new document** is created with `ownerId: user.uid`
- Saved copies are completely independent of the original shared PDF
- Users retain full control over their saved copies even if original access is revoked

### 3. Access Revocation Behavior

#### When access is revoked from a shared PDF:

✅ **User loses access to**: Original shared PDF via `/shared/[id]` URL
❌ **User retains access to**: Any saved copies in their personal collection

This is the intended behavior because:

- Saved copies are the user's own documents
- Revoking sharing access shouldn't delete user's personal files
- Users who saved PDFs have made a legitimate copy when they had permission

## Data Structure

### PDF Document Structure

```typescript
{
  id: string;
  name: string;
  url: string;
  ownerId: string;           // User who owns this document
  uploadedBy: string;        // Email of uploader
  isPubliclyShared: boolean; // Public link access
  allowSave: boolean;        // Default save permission for new shares
  accessUsers: [             // Users with explicit access
    {
      email: string;
      canSave: boolean;      // Individual save permission
      addedAt: Date;
    }
  ]
}
```

### Access Check Logic (Shared PDF Page)

```typescript
const isOwner = user?.uid === data.ownerId;
const hasExplicitAccess = data.accessUsers.find((u) => u.email === user?.email);
const isPubliclyShared = data.isPubliclyShared === true;

// Allow access if any of these conditions are met:
if (isOwner || hasExplicitAccess || isPubliclyShared) {
  // Grant access
} else {
  // Deny access
}
```

## User Interface Features

### Share Dialog

- **Share Tab**: Add new users, manage public links, set default permissions
- **Manage Access Tab**: View all users with access, modify individual permissions, revoke access
- **Saved Copy Indicators**: Shows which users have saved copies (will retain access)

### Permission Indicators

- **Non-authenticated users**: "Viewing mode - Log in to save and download"
- **View-only users**: "View only - Saving and downloading not allowed"
- **Can-save users**: "Save this PDF to enable download and open in new tab"
- **Saved users**: "Saved to your collection - Full access enabled"

## Security Considerations

1. **Firebase Rules**: Ensure storage and Firestore rules allow appropriate access
2. **Client-side Validation**: UI prevents unauthorized actions
3. **Server-side Enforcement**: Firebase rules provide final access control
4. **Saved Copy Independence**: Saved copies are user-owned and independent

## Best Practices

1. **Clear Communication**: UI clearly explains permission levels and implications
2. **Graceful Degradation**: Users without permission see appropriate messages
3. **Audit Trail**: Track when users are added/removed from access lists
4. **Flexible Permissions**: Support both global and per-user permission settings
