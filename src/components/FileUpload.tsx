import { useRef, useState } from 'react';

interface FileUploadProps {
  onFiles: (files: FileList) => void;
  /** Small "load another file" control for the header once data is loaded. */
  compact?: boolean;
  fileNames?: string[];
}

export default function FileUpload({ onFiles, compact = false, fileNames = [] }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const input = (
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
  );

  if (compact) {
    return (
      <div className="file-bar">
        <span className="file-bar-name" title={fileNames.join(', ')}>
          📄 {fileNames.join(', ') || 'Timetable loaded'}
        </span>
        <button className="btn btn-light btn-sm" type="button" onClick={() => inputRef.current?.click()}>
          Load another file
        </button>
        {input}
      </div>
    );
  }

  return (
    <section className="upload-hero">
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
        <div className="upload-icon" aria-hidden>
          📂
        </div>
        <div className="upload-text">Drop your timetable file here</div>
        <div className="upload-hint">CSV, Excel (.xlsx / .xls) or the Oracle “CollegeTimeTable” export</div>
        <button className="btn" type="button">
          Choose file
        </button>
        {input}
      </div>
      <ul className="upload-features">
        <li>
          <strong>🕒 Availability</strong>
          <span>Who is teaching or free at any time</span>
        </li>
        <li>
          <strong>🗓️ Meeting finder</strong>
          <span>Common free slots for a group of instructors</span>
        </li>
        <li>
          <strong>🏫 Rooms</strong>
          <span>Occupancy per room, building and department</span>
        </li>
        <li>
          <strong>📑 Reports</strong>
          <span>Shareable PDF and Excel utilization reports</span>
        </li>
      </ul>
      <p className="upload-privacy">Your file is processed in your browser and is never uploaded anywhere.</p>
    </section>
  );
}
