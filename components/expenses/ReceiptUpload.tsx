"use client";

import { useState, useRef } from "react";
import { Upload, X, FileImage } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ReceiptUploadProps {
  userId: string;
  reportId: string;
  dayIndex: number;
  existingPath?: string | null;
  onUploaded: (path: string | null) => void;
  readOnly?: boolean;
}

export function ReceiptUpload({ userId, reportId, dayIndex, existingPath, onUploaded, readOnly }: ReceiptUploadProps) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [path, setPath] = useState<string | null>(existingPath ?? null);

  async function handleUpload(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const filePath = `${userId}/${reportId}/day${dayIndex}.${ext}`;

      const { error } = await supabase.storage
        .from("expense-receipts")
        .upload(filePath, file, { upsert: true });

      if (error) throw error;

      setPath(filePath);
      onUploaded(filePath);
      toast({ title: "Receipt uploaded", variant: "success" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!path) return;
    setUploading(true);
    try {
      await supabase.storage.from("expense-receipts").remove([path]);
      setPath(null);
      onUploaded(null);
      toast({ title: "Receipt removed" });
    } catch (err: any) {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  if (readOnly) {
    if (!path) return null;
    return (
      <div className="flex items-center gap-1 text-xs text-emerald-600">
        <FileImage className="w-3 h-3" />
        Receipt attached
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />
      {path ? (
        <div className="flex items-center gap-1">
          <span className="text-xs text-emerald-600 flex items-center gap-0.5">
            <FileImage className="w-3 h-3" />
            Receipt
          </span>
          <button
            onClick={handleRemove}
            disabled={uploading}
            className="text-red-400 hover:text-red-600 disabled:opacity-50"
            title="Remove receipt"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          title="Upload receipt"
        >
          <Upload className="w-3 h-3" />
          {uploading ? "Uploading…" : "Receipt"}
        </button>
      )}
    </div>
  );
}
