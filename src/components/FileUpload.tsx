import { useRef, useState } from 'react';

interface FileUploadProps {
  onFiles: (files: FileList) => void;
}

export default function FileUpload({ onFiles }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="upload-section">
      <div
        className={`drop-zone${dragOver ? ' dragover' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
        }}
      >
        <div className="upload-icon">📁</div>
        <div className="upload-text">Drop your schedule file here or click to browse</div>
        <button className="btn" type="button">
          Choose File
        </button>
        <input
          ref={inputRef}
          type="file"
          className="file-input"
          accept=".csv,.xlsx,.xls"
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
