# PDF Security Implementation

## Overview

This document outlines the comprehensive security measures implemented to prevent unauthorized PDF downloads through browser tools, developer consoles, and network inspection while allowing legitimate downloads for users with proper privileges.

## Security Layers

### 1. Server-Side Security

#### Enhanced PDF Proxy API (`/api/pdf-proxy`)

**Authentication & Authorization:**

- Firebase Admin SDK token verification
- User identity validation against Firestore permissions
- Rate limiting (20 requests per minute per user)
- Timestamp validation to prevent replay attacks (5-minute window)
- Referer validation to prevent direct API access

**Security Headers:**

```typescript
{
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cache-Control": "no-cache, no-store, must-revalidate, private, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "Vary": "Authorization, Accept, Accept-Encoding, User-Agent"
}
```

#### Secure Download API (`/api/secure-download`)

**Permission Validation:**

- Validates user ownership or explicit download permissions
- Checks `canSave` permission for shared users
- Rate limiting (5 downloads per minute per user)
- Comprehensive audit logging

**Download Flow:**

1. User requests download through secure API
2. Server validates permissions against Firestore
3. Generates time-limited secure download URL
4. Returns authorized download URL to client
5. Client fetches PDF through secure proxy

### 2. Client-Side Security

#### Browser Tool Prevention

**Right-Click & Context Menu:**

```javascript
// Disable right-click context menu
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  return false;
});
```

**Text Selection & Copying:**

```javascript
// Disable text selection
document.addEventListener("selectstart", (e) => {
  e.preventDefault();
  return false;
});
```

**Drag & Drop Prevention:**

```javascript
// Disable drag and drop
document.addEventListener("dragstart", (e) => {
  e.preventDefault();
  return false;
});
```

**Keyboard Shortcuts:**

```javascript
// Disable developer tools and save shortcuts
const blockedKeys = [
  "F12", // Developer tools
  "Ctrl+Shift+I", // Developer tools
  "Ctrl+Shift+C", // Inspect element
  "Ctrl+Shift+J", // Console
  "Ctrl+U", // View source
  "Ctrl+S", // Save page
  "Meta+S", // Save page (Mac)
];
```

#### Developer Tools Detection

**Window Size Monitoring:**

```javascript
const detectDevTools = () => {
  if (
    window.outerHeight - window.innerHeight > 160 ||
    window.outerWidth - window.innerWidth > 160
  ) {
    console.clear();
    console.log("%cDeveloper tools detected!", "color: red; font-size: 20px;");
    // Optional: Close PDF viewer or show warning
  }
};
```

### 3. CSS Security Measures

#### Text Selection Prevention

```css
.pdf-secure {
  -webkit-user-select: none !important;
  -moz-user-select: none !important;
  -ms-user-select: none !important;
  user-select: none !important;
  -webkit-touch-callout: none !important;
  -webkit-tap-highlight-color: transparent !important;
}
```

#### Canvas Protection

```css
.react-pdf__Page__canvas {
  -webkit-user-drag: none !important;
  -khtml-user-drag: none !important;
  -moz-user-drag: none !important;
  -o-user-drag: none !important;
  user-drag: none !important;
}
```

#### Print Prevention

```css
@media print {
  .pdf-secure {
    display: none !important;
  }
}
```

#### Text Layer Security

```css
.react-pdf__Page__textContent {
  pointer-events: none !important;
  -webkit-user-select: none !important;
  -moz-user-select: none !important;
  user-select: none !important;
}
```

### 4. PDF.js Configuration

#### Security Options

```javascript
const options = {
  cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
  cMapPacked: true,
  standardFontDataUrl:
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/",
  disableAnnotationLayer: true, // Disable annotations
  // Text layer kept for accessibility but secured via CSS
};
```

#### Security Overlays

```jsx
// Transparent overlay to prevent direct canvas interaction
<div className="pdf-security-overlay" />
```

### 5. Network Security

#### CORS Configuration

```javascript
// Strict CORS policy
"Access-Control-Allow-Origin": isValidReferer ? referer : "*",
"Access-Control-Allow-Credentials": "true"
```

#### Cache Prevention

```javascript
// Aggressive cache busting
u.searchParams.set("t", Date.now().toString());
u.searchParams.set("pdfId", pdfId);

// Response headers
"Cache-Control": "no-cache, no-store, must-revalidate, private, max-age=0",
"Pragma": "no-cache",
"Expires": "0"
```

### 6. Permission-Based Access Control

#### Download Authorization Matrix

| User Type                    | View PDF | Download | Open New Tab |
| ---------------------------- | -------- | -------- | ------------ |
| Owner                        | ✅       | ✅       | ✅           |
| Shared User (canSave: true)  | ✅       | ✅       | ✅           |
| Shared User (canSave: false) | ✅       | ❌       | ❌           |
| Public User (saved)          | ✅       | ✅       | ✅           |
| Public User (not saved)      | ✅       | ❌       | ❌           |
| Unauthenticated              | ✅       | ❌       | ❌           |

#### Implementation Logic

```javascript
// Download button only shown when authorized
{
  canDownload && isSaved && <button onClick={handleDownload}>Download</button>;
}

// Secure download function validates permissions
async function handleDownload() {
  if (!canDownload || !isSaved) {
    setError("Download not authorized for this PDF");
    return;
  }
  // ... secure download logic
}
```

## Security Limitations & Considerations

### What This Implementation Prevents:

- ✅ Right-click context menu access
- ✅ Keyboard shortcut downloads (Ctrl+S)
- ✅ Text selection and copying
- ✅ Direct URL access without authentication
- ✅ Unauthorized API access
- ✅ Browser cache exploitation
- ✅ Simple developer tools usage
- ✅ Drag and drop saving
- ✅ Print screen functionality (partially)

### What Advanced Users Can Still Do:

- ⚠️ Network traffic interception (HTTPS mitigates)
- ⚠️ Browser extension manipulation
- ⚠️ Screenshot/screen recording
- ⚠️ Mobile device screenshot
- ⚠️ Advanced developer tools bypass
- ⚠️ Browser automation tools

### Additional Security Measures (Future Implementation):

1. **Watermarking**: Add user-specific watermarks to PDFs
2. **DRM Integration**: Implement digital rights management
3. **Session Recording**: Monitor user interactions
4. **IP Restrictions**: Limit access by geographic location
5. **Device Fingerprinting**: Track and limit device access
6. **PDF Encryption**: Server-side PDF encryption/decryption

## Usage Guidelines

### For Developers:

1. Always validate user permissions server-side
2. Use the secure download API for all downloads
3. Apply security CSS classes to PDF containers
4. Monitor security event logs
5. Keep security measures updated

### For Content Owners:

1. Use "canSave: false" for sensitive documents
2. Regularly review access permissions
3. Monitor download logs
4. Consider additional watermarking for sensitive content
5. Educate users about security limitations

## Testing Security Measures

### Manual Testing Checklist:

- [ ] Right-click disabled on PDF content
- [ ] Ctrl+S blocked
- [ ] F12 developer tools blocked
- [ ] Text selection disabled
- [ ] Drag and drop disabled
- [ ] Download only works for authorized users
- [ ] Direct API access blocked
- [ ] Invalid tokens rejected
- [ ] Rate limiting enforced

### Automated Testing:

```javascript
// Example security test
describe("PDF Security", () => {
  it("should prevent unauthorized downloads", async () => {
    const response = await fetch("/api/secure-download", {
      method: "POST",
      body: JSON.stringify({ pdfId: "test", authToken: "invalid" }),
    });
    expect(response.status).toBe(401);
  });
});
```

## Monitoring & Logging

### Security Events Logged:

- PDF access attempts
- Download requests
- Failed authentication attempts
- Rate limit violations
- Developer tools detection
- Suspicious user behavior

### Log Analysis:

- Monitor for unusual download patterns
- Track failed authentication attempts
- Analyze user access patterns
- Identify potential security bypasses

## Conclusion

This multi-layered security implementation provides robust protection against common PDF download bypass attempts while maintaining usability for authorized users. The system balances security with user experience, ensuring that legitimate users can access content while preventing unauthorized downloads through browser tools and developer consoles.

Regular security audits and updates are recommended to maintain effectiveness against evolving bypass techniques.
