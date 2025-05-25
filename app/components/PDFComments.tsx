import { useState, useEffect, useRef } from "react";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  getDocs,
  updateDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import { format } from "date-fns";
import Image from "next/image";
import { createHash } from "crypto";

interface Reply {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  timestamp: Date;
}

interface Comment {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  timestamp: Date;
  formattedText: string;
  likes: string[]; // array of userIds who liked
  replies: Reply[];
}

interface PDFCommentsProps {
  pdfId: string;
  isOwner: boolean;
  isAuthorized: boolean;
  fileUrl: string;
}

interface FirestoreReply {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | undefined;
  text: string;
  timestamp: Timestamp;
}

interface CommentData {
  pdfContentId: string;
  pdfId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  timestamp: Date;
  formattedText: string;
  likes: string[];
  replies: Reply[];
}

// Function to generate a consistent hash for a PDF URL
function generatePdfHash(url: string): string {
  // Remove any query parameters or fragments from the URL
  const baseUrl = url.split("?")[0].split("#")[0];
  // Create a hash of the URL
  return createHash("sha256").update(baseUrl).digest("hex");
}

// convert raw editor HTML (with "- " lines) into real UL/LI
function convertBullets(rawHtml: string): string {
  // normalize <div> and <br> into newlines
  const text = rawHtml
    .replace(/<div>/g, "\n")
    .replace(/<\/div>/g, "\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/&nbsp;/g, " ");

  const lines = text.split(/\n/);
  let html = "";
  let inList = false;

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith("- ")) {
      if (!inList) {
        html += `<ul class="list-disc pl-5">`;
        inList = true;
      }
      html += `<li>${line.slice(2)}</li>`;
    } else if (line === "") {
      if (inList) {
        html += `</ul>`;
        inList = false;
      }
    } else {
      if (inList) {
        html += `</ul>`;
        inList = false;
      }
      html += `<p>${line}</p>`;
    }
  }
  if (inList) html += `</ul>`;
  return html;
}

export default function PDFComments({
  pdfId,
  isOwner,
  isAuthorized,
  fileUrl,
}: PDFCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isBoldActive, setIsBoldActive] = useState(false);
  const [isItalicActive, setIsItalicActive] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isReplyBoldActive, setIsReplyBoldActive] = useState(false);
  const [isReplyItalicActive, setIsReplyItalicActive] = useState(false);
  const [showFormattingTools, setShowFormattingTools] = useState(false);
  const [showReplyFormattingTools, setShowReplyFormattingTools] =
    useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const replyEditorRef = useRef<HTMLDivElement>(null);
  const auth = getAuth();
  const db = getFirestore();

  // Generate a consistent identifier for this PDF based on its URL
  const pdfContentId = generatePdfHash(fileUrl);

  // subscribe to comments using pdfContentId instead of pdfId
  useEffect(() => {
    if (!isAuthorized || !pdfContentId) return;

    const q = query(
      collection(db, "pdf_comments"),
      where("pdfContentId", "==", pdfContentId),
      orderBy("timestamp", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        timestamp: (d.data().timestamp as Timestamp).toDate(),
        likes: d.data().likes || [],
        replies: (d.data().replies || []).map((r: FirestoreReply) => ({
          ...r,
          timestamp: r.timestamp.toDate(),
        })),
      })) as Comment[];
      setComments(docs);
    });
    return () => unsub();
  }, [pdfContentId, isAuthorized, db]);

  // sync Bold/Italic button state
  useEffect(() => {
    const onSel = () => {
      setIsBoldActive(document.queryCommandState("bold"));
      setIsItalicActive(document.queryCommandState("italic"));
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  const toggleBold = (isReply = false) => {
    document.execCommand("bold");
    if (isReply) {
      setIsReplyBoldActive((v) => !v);
      replyEditorRef.current?.focus();
    } else {
      setIsBoldActive((v) => !v);
      editorRef.current?.focus();
    }
  };

  const toggleItalic = (isReply = false) => {
    document.execCommand("italic");
    if (isReply) {
      setIsReplyItalicActive((v) => !v);
      replyEditorRef.current?.focus();
    } else {
      setIsItalicActive((v) => !v);
      editorRef.current?.focus();
    }
  };

  const insertBulletPrefix = (isReply = false) => {
    document.execCommand("insertText", false, "- ");
    if (isReply) {
      replyEditorRef.current?.focus();
    } else {
      editorRef.current?.focus();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>, isReply = false) => {
    if (isReply) {
      setReplyText(e.currentTarget.innerHTML);
    } else {
      setNewComment(e.currentTarget.innerHTML);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    isReply = false,
    commentId?: string
  ) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        // Shift+Enter: Allow default behavior (new line)
        return;
      } else {
        // Enter: Send comment/reply
        e.preventDefault();
        if (isReply && commentId) {
          addReply(commentId);
        } else if (!isReply) {
          addComment();
        }
      }
    }
  };

  const addComment = async () => {
    if (!newComment.trim() || !auth.currentUser) return;
    const finalHtml = convertBullets(newComment);
    try {
      const commentData: CommentData = {
        pdfContentId, // Use the content-based identifier
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || "Anonymous",
        userAvatar: auth.currentUser.photoURL ?? undefined,
        timestamp: new Date(),
        formattedText: finalHtml,
        likes: [],
        replies: [],
      };

      // Only add pdfId if it exists
      if (pdfId) {
        commentData.pdfId = pdfId;
      }

      await addDoc(collection(db, "pdf_comments"), commentData);
      setNewComment("");
      if (editorRef.current) editorRef.current.innerHTML = "";
      setShowFormattingTools(false);
    } catch (err) {
      console.error(err);
    }
  };

  const addReply = async (commentId: string) => {
    if (!replyText.trim() || !auth.currentUser) return;
    try {
      const commentRef = doc(db, "pdf_comments", commentId);
      const comment = comments.find((c) => c.id === commentId);
      if (!comment) return;

      const finalHtml = convertBullets(replyText);

      const newReply: Reply = {
        id: Date.now().toString(),
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || "Anonymous",
        userAvatar: auth.currentUser.photoURL ?? undefined,
        text: finalHtml,
        timestamp: new Date(),
      };

      await updateDoc(commentRef, {
        replies: [...comment.replies, newReply],
      });

      setReplyText("");
      setReplyingTo(null);
      setShowReplyFormattingTools(false);
      if (replyEditorRef.current) replyEditorRef.current.innerHTML = "";
    } catch (err) {
      console.error(err);
    }
  };

  const toggleLike = async (commentId: string) => {
    if (!auth.currentUser) return;
    try {
      const commentRef = doc(db, "pdf_comments", commentId);
      const comment = comments.find((c) => c.id === commentId);
      if (!comment) return;

      const userId = auth.currentUser.uid;
      const newLikes = comment.likes.includes(userId)
        ? comment.likes.filter((id) => id !== userId)
        : [...comment.likes, userId];

      await updateDoc(commentRef, { likes: newLikes });
    } catch (err) {
      console.error(err);
    }
  };

  const clearAllComments = async () => {
    if (!isOwner) return;
    const q = query(
      collection(db, "pdf_comments"),
      where("pdfContentId", "==", pdfContentId)
    );
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  };

  const UserAvatar = ({ url, name }: { url?: string; name: string }) => (
    <div className="flex-shrink-0">
      {url ? (
        <Image
          src={url}
          alt={name}
          width={32}
          height={32}
          className="rounded-full"
        />
      ) : (
        <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
          <span className="text-sm font-medium text-secondary-foreground">
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );

  if (!isAuthorized) {
    return (
      <div className="p-4 text-muted-foreground">
        You need to be authorized to view comments.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card rounded-lg shadow-lg border border-border">
      {/* Header */}
      <div className="p-3 md:p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-base md:text-lg font-semibold text-foreground">
          Comments
        </h2>
        {isOwner && (
          <button
            onClick={clearAllComments}
            className="p-2 text-destructive hover:text-destructive/80 hover:bg-destructive/10 rounded-full transition-colors"
            title="Clear all comments"
          >
            <svg
              className="w-4 h-4 md:w-5 md:h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 md:space-y-4">
        {comments.map((c) => (
          <div
            key={c.id}
            className="bg-secondary/50 rounded-lg p-2 md:p-3 space-y-2"
          >
            <div className="flex items-start space-x-2 md:space-x-3">
              <UserAvatar url={c.userAvatar} name={c.userName} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-foreground text-sm md:text-base truncate">
                    {c.userName}
                  </span>
                  <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0 ml-2">
                    {format(c.timestamp, "MMM d, yyyy h:mm a")}
                  </span>
                </div>
                <div
                  className="mt-1 md:mt-2 text-foreground text-sm md:text-base"
                  dangerouslySetInnerHTML={{ __html: c.formattedText }}
                />
                <div className="mt-2 flex items-center space-x-3 md:space-x-4">
                  <button
                    onClick={() => toggleLike(c.id)}
                    className={`text-xs md:text-sm flex items-center space-x-1 ${
                      c.likes.includes(auth.currentUser?.uid || "")
                        ? "text-primary"
                        : "text-muted-foreground hover:text-primary"
                    }`}
                  >
                    <svg
                      className="w-3 h-3 md:w-4 md:h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={
                          c.likes.includes(auth.currentUser?.uid || "")
                            ? "M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
                            : "M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
                        }
                      />
                    </svg>
                    <span>{c.likes.length}</span>
                  </button>
                  <button
                    onClick={() => setReplyingTo(c.id)}
                    className="text-xs md:text-sm text-muted-foreground hover:text-primary"
                  >
                    Reply
                  </button>
                </div>
              </div>
            </div>

            {/* Replies */}
            {c.replies.length > 0 && (
              <div className="ml-6 md:ml-8 mt-2 space-y-2">
                {c.replies.map((reply) => (
                  <div
                    key={reply.id}
                    className="flex items-start space-x-2 md:space-x-3 bg-card rounded-lg p-2 border border-border"
                  >
                    <UserAvatar url={reply.userAvatar} name={reply.userName} />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-foreground text-sm truncate">
                          {reply.userName}
                        </span>
                        <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                          {format(reply.timestamp, "MMM d, yyyy h:mm a")}
                        </span>
                      </div>
                      <div
                        className="mt-1 text-foreground text-sm"
                        dangerouslySetInnerHTML={{ __html: reply.text }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reply Input */}
            {replyingTo === c.id && (
              <div className="ml-6 md:ml-8 mt-2">
                {/* Mobile Formatting Toggle */}
                <div className="md:hidden mb-2">
                  <button
                    onClick={() =>
                      setShowReplyFormattingTools(!showReplyFormattingTools)
                    }
                    className="text-xs text-muted-foreground hover:text-primary"
                  >
                    {showReplyFormattingTools ? "Hide" : "Show"} formatting
                  </button>
                </div>

                {/* Formatting Tools */}
                <div
                  className={`${
                    showReplyFormattingTools ? "flex" : "hidden md:flex"
                  } space-x-2 mb-2`}
                >
                  <button
                    onClick={() => toggleBold(true)}
                    className={`p-1 md:p-2 rounded hover:bg-secondary ${
                      isReplyBoldActive ? "bg-secondary" : ""
                    } text-foreground text-sm`}
                    title="Bold"
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    onClick={() => toggleItalic(true)}
                    className={`p-1 md:p-2 rounded hover:bg-secondary ${
                      isReplyItalicActive ? "bg-secondary" : ""
                    } text-foreground text-sm`}
                    title="Italic"
                  >
                    <em>I</em>
                  </button>
                  <button
                    onClick={() => insertBulletPrefix(true)}
                    className="p-1 md:p-2 rounded hover:bg-secondary text-foreground text-sm"
                    title="Insert Bullet Prefix"
                  >
                    •
                  </button>
                </div>
                <div className="flex items-start space-x-2">
                  <div
                    ref={replyEditorRef}
                    contentEditable
                    onInput={(e) => handleInput(e, true)}
                    onKeyDown={(e) => handleKeyDown(e, true, c.id)}
                    className="flex-1 p-2 border border-border rounded-lg outline-none min-h-[2.5rem] md:min-h-[3rem] bg-background text-foreground text-sm md:text-base"
                  />
                  <button
                    onClick={() => addReply(c.id)}
                    className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 bg-primary rounded-full hover:bg-primary/90"
                    title="Send Reply"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 12h14M12 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 md:p-4 border-t border-border">
        {/* Mobile Formatting Toggle */}
        <div className="md:hidden mb-2">
          <button
            onClick={() => setShowFormattingTools(!showFormattingTools)}
            className="text-xs text-muted-foreground hover:text-primary"
          >
            {showFormattingTools ? "Hide" : "Show"} formatting
          </button>
        </div>

        {/* Formatting Tools */}
        <div
          className={`${
            showFormattingTools ? "flex" : "hidden md:flex"
          } space-x-2 mb-2`}
        >
          <button
            onClick={() => toggleBold(false)}
            className={`p-1 md:p-2 rounded hover:bg-secondary ${
              isBoldActive ? "bg-secondary" : ""
            } text-foreground text-sm`}
            title="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            onClick={() => toggleItalic(false)}
            className={`p-1 md:p-2 rounded hover:bg-secondary ${
              isItalicActive ? "bg-secondary" : ""
            } text-foreground text-sm`}
            title="Italic"
          >
            <em>I</em>
          </button>
          <button
            onClick={() => insertBulletPrefix(false)}
            className="p-1 md:p-2 rounded hover:bg-secondary text-foreground text-sm"
            title="Insert Bullet Prefix"
          >
            •
          </button>
        </div>
        <div className="flex items-start space-x-2">
          <div
            ref={editorRef}
            contentEditable
            onInput={(e) => handleInput(e, false)}
            onKeyDown={(e) => handleKeyDown(e, false)}
            className="flex-1 p-2 border border-border rounded-lg outline-none min-h-[2.5rem] md:min-h-[3rem] bg-background text-foreground text-sm md:text-base"
          />
          <button
            onClick={addComment}
            className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 bg-primary rounded-full hover:bg-primary/90"
            title="Send Comment"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 12h14M12 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
