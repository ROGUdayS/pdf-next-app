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
}

interface FirestoreReply {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | undefined;
  text: string;
  timestamp: Timestamp;
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
}: PDFCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isBoldActive, setIsBoldActive] = useState(false);
  const [isItalicActive, setIsItalicActive] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const auth = getAuth();
  const db = getFirestore();

  // subscribe to comments
  useEffect(() => {
    if (!isAuthorized || !pdfId) return;

    const q = query(
      collection(db, "pdf_comments"),
      where("pdfId", "==", pdfId),
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
  }, [pdfId, isAuthorized, db]);

  // sync Bold/Italic button state
  useEffect(() => {
    const onSel = () => {
      setIsBoldActive(document.queryCommandState("bold"));
      setIsItalicActive(document.queryCommandState("italic"));
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  const toggleBold = () => {
    document.execCommand("bold");
    setIsBoldActive((v) => !v);
    editorRef.current?.focus();
  };

  const toggleItalic = () => {
    document.execCommand("italic");
    setIsItalicActive((v) => !v);
    editorRef.current?.focus();
  };

  const insertBulletPrefix = () => {
    document.execCommand("insertText", false, "- ");
    editorRef.current?.focus();
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    setNewComment(e.currentTarget.innerHTML);
  };

  const addComment = async () => {
    if (!newComment.trim() || !auth.currentUser) return;
    const finalHtml = convertBullets(newComment);
    try {
      await addDoc(collection(db, "pdf_comments"), {
        pdfId,
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || "Anonymous",
        userAvatar: auth.currentUser.photoURL ?? undefined,
        timestamp: new Date(),
        formattedText: finalHtml,
        likes: [],
        replies: [],
      });
      setNewComment("");
      if (editorRef.current) editorRef.current.innerHTML = "";
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

      const newReply: Reply = {
        id: Date.now().toString(),
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || "Anonymous",
        userAvatar: auth.currentUser.photoURL ?? undefined,
        text: replyText,
        timestamp: new Date(),
      };

      await updateDoc(commentRef, {
        replies: [...comment.replies, newReply],
      });

      setReplyText("");
      setReplyingTo(null);
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
      where("pdfId", "==", pdfId)
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
        <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
          <span className="text-sm font-medium text-gray-600">
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );

  if (!isAuthorized) {
    return (
      <div className="p-4 text-gray-600">
        You need to be authorized to view comments.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-lg font-semibold">Comments</h2>
        {isOwner && (
          <button
            onClick={clearAllComments}
            className="text-sm text-red-500 hover:text-red-600"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {comments.map((c) => (
          <div key={c.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex items-start space-x-3">
              <UserAvatar url={c.userAvatar} name={c.userName} />
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <span className="font-medium">{c.userName}</span>
                  <span className="text-sm text-gray-500">
                    {format(c.timestamp, "MMM d, yyyy h:mm a")}
                  </span>
                </div>
                <div
                  className="mt-2 text-gray-700"
                  dangerouslySetInnerHTML={{ __html: c.formattedText }}
                />
                <div className="mt-2 flex items-center space-x-4">
                  <button
                    onClick={() => toggleLike(c.id)}
                    className={`text-sm flex items-center space-x-1 ${
                      c.likes.includes(auth.currentUser?.uid || "")
                        ? "text-blue-500"
                        : "text-gray-500 hover:text-blue-500"
                    }`}
                  >
                    <svg
                      className="w-4 h-4"
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
                    className="text-sm text-gray-500 hover:text-blue-500"
                  >
                    Reply
                  </button>
                </div>
              </div>
            </div>

            {/* Replies */}
            {c.replies.length > 0 && (
              <div className="ml-8 mt-2 space-y-2">
                {c.replies.map((reply) => (
                  <div
                    key={reply.id}
                    className="flex items-start space-x-3 bg-white rounded-lg p-2"
                  >
                    <UserAvatar url={reply.userAvatar} name={reply.userName} />
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <span className="font-medium">{reply.userName}</span>
                        <span className="text-sm text-gray-500">
                          {format(reply.timestamp, "MMM d, yyyy h:mm a")}
                        </span>
                      </div>
                      <p className="mt-1 text-gray-700">{reply.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reply Input */}
            {replyingTo === c.id && (
              <div className="ml-8 mt-2 flex items-start space-x-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a reply..."
                  className="flex-1 p-2 border rounded-lg"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      addReply(c.id);
                    }
                  }}
                />
                <button
                  onClick={() => addReply(c.id)}
                  className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Reply
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex space-x-2 mb-2">
          <button
            onClick={toggleBold}
            className={`p-2 rounded hover:bg-gray-100 ${
              isBoldActive ? "bg-gray-200" : ""
            }`}
            title="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            onClick={toggleItalic}
            className={`p-2 rounded hover:bg-gray-100 ${
              isItalicActive ? "bg-gray-200" : ""
            }`}
            title="Italic"
          >
            <em>I</em>
          </button>
          <button
            onClick={insertBulletPrefix}
            className="p-2 rounded hover:bg-gray-100"
            title="Insert Bullet Prefix"
          >
            •
          </button>
        </div>

        <div className="flex items-start space-x-2">
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            className="flex-1 p-2 border rounded-lg outline-none min-h-[3rem]"
          />
          <button
            onClick={addComment}
            className="flex items-center justify-center w-10 h-10 bg-blue-500 rounded-full hover:bg-blue-600"
            title="Send Comment"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-white"
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
