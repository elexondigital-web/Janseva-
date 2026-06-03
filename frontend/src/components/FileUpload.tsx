import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { uploadsApi } from '../api/uploads.api';
import { IconTrash, IconPlus } from './ui/Icon';

interface FileUploadProps {
  label: string;
  value: string | null;
  folder: 'photos' | 'aadhaar';
  onChange: (url: string | null) => void;
  aspect?: 'square' | 'wide';
  hint?: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp';

export default function FileUpload({
  label,
  value,
  folder,
  onChange,
  aspect = 'square',
  hint,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error('File too large (max 5MB)');
      return;
    }
    setUploading(true);
    try {
      const result = await uploadsApi.upload(file, folder);
      onChange(result.url);
      toast.success(`${label} uploaded`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  const box =
    aspect === 'square'
      ? 'aspect-square max-w-[200px]'
      : 'aspect-[3/2] max-w-[260px]';

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-navy uppercase tracking-wide">
        {label}
      </label>
      <div
        className={`${box} w-full bg-surface-subtle border-2 border-dashed border-border rounded overflow-hidden flex items-center justify-center relative group`}
      >
        {value ? (
          <>
            <img
              src={value}
              alt={label}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Remove"
              className="absolute top-2 right-2 bg-status-red text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <IconTrash size={14} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex flex-col items-center gap-1.5 text-text-secondary hover:text-primary px-4 py-6 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <span className="text-sm">Uploading…</span>
            ) : (
              <>
                <IconPlus size={24} />
                <span className="text-xs font-medium">Click to upload</span>
                <span className="text-[11px] text-text-muted">
                  JPG, PNG, WebP · max 5MB
                </span>
              </>
            )}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleInputChange}
          className="hidden"
        />
      </div>
      {hint && <p className="text-[11px] text-text-muted">{hint}</p>}
    </div>
  );
}
