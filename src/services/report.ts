import { jsPDF } from 'jspdf';
import type { EventLogItem, SessionHistoryItem } from '../types';

export function exportToCSV(logs: EventLogItem[], filename = 'detection-session-logs.csv') {
  const headers = [
    'Timestamp',
    'Track ID',
    'Class Name',
    'Confidence',
    'Status',
    'Severity',
    'Defect Class',
    'Zone Name',
  ];
  const rows = logs.map((log) => [
    new Date(log.timestamp).toISOString(),
    log.trackId,
    log.className,
    log.confidence.toFixed(2),
    log.status,
    log.severity || 'N/A',
    log.defectClass || 'N/A',
    log.zoneName || 'N/A',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((e) => e.map((val) => `"${val.replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToJSON(session: SessionHistoryItem, filename = 'session-data.json') {
  const jsonContent = JSON.stringify(session, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function generatePDFReport(session: SessionHistoryItem) {
  const doc = new jsPDF();

  // Color palette
  const darkBlue = [30, 41, 59]; // slate-800
  const lightBlue = [241, 245, 249]; // slate-100
  const softRed = [254, 242, 242]; // red-50
  
  // Header Title
  doc.setFontSize(22);
  doc.setTextColor(darkBlue[0], darkBlue[1], darkBlue[2]);
  doc.text('Object & Defect Counting Report', 14, 20);

  // Metadata subtitle
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // slate-500
  const dateStr = new Date(session.startTime).toLocaleString();
  doc.text(`Generated on: ${new Date().toLocaleString()} | Session Started: ${dateStr}`, 14, 26);

  // Line Separator
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.line(14, 30, 196, 30);

  // Section 1: Session Metrics
  doc.setFontSize(13);
  doc.setTextColor(darkBlue[0], darkBlue[1], darkBlue[2]);
  doc.text('Session Metrics Summary', 14, 40);

  // Metrics Box
  doc.setFillColor(lightBlue[0], lightBlue[1], lightBlue[2]);
  doc.rect(14, 44, 182, 36, 'F');

  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  
  const totalCounts = Object.values(session.totalCounts).reduce((sum, v) => sum + v, 0);
  const passCount = session.totalDetected - session.defectCount;
  const defectRate = session.totalDetected > 0 ? (session.defectCount / session.totalDetected) * 100 : 0;
  const durationSec = Math.round((session.endTime - session.startTime) / 1000);
  const durationStr = durationSec > 60 
    ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` 
    : `${durationSec}s`;

  doc.text(`Total Detected (Unique IDs): ${session.totalDetected}`, 20, 51);
  doc.text(`Pass Items: ${passCount}`, 20, 58);
  doc.text(`Defect Items: ${session.defectCount}`, 20, 65);
  doc.text(`Defect Rate: ${defectRate.toFixed(2)}%`, 20, 72);

  doc.text(`Session Duration: ${durationStr}`, 110, 51);
  doc.text(`Total Detections Logged: ${totalCounts}`, 110, 58);
  
  // Section 2: Class Counts Table
  doc.setFontSize(13);
  doc.setTextColor(darkBlue[0], darkBlue[1], darkBlue[2]);
  doc.text('Object Class Distribution', 14, 90);

  // Table header
  doc.setFillColor(lightBlue[0], lightBlue[1], lightBlue[2]);
  doc.rect(14, 94, 182, 7, 'F');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text('Class Name', 18, 99);
  doc.text('Unique Count', 120, 99);

  let y = 107;
  const classes = Object.entries(session.totalCounts);
  if (classes.length === 0) {
    doc.text('No objects counted during this session.', 18, y);
    y += 8;
  } else {
    classes.forEach(([className, count]) => {
      doc.text(className.charAt(0).toUpperCase() + className.slice(1), 18, y);
      doc.text(count.toString(), 120, y);
      doc.setDrawColor(241, 245, 249);
      doc.line(14, y + 2, 196, y + 2);
      y += 8;
    });
  }

  // Section 3: Defect logs
  const defectLogs = session.logs.filter((l) => l.status === 'fail');
  if (defectLogs.length > 0) {
    if (y > 210) {
      doc.addPage();
      y = 20;
    } else {
      y += 10;
    }

    doc.setFontSize(13);
    doc.setTextColor(darkBlue[0], darkBlue[1], darkBlue[2]);
    doc.text(`Recent Defect Logs (${defectLogs.length} total)`, 14, y);
    y += 5;

    // Table header
    doc.setFillColor(softRed[0], softRed[1], softRed[2]);
    doc.rect(14, y, 182, 7, 'F');
    doc.setFontSize(9);
    doc.setTextColor(153, 27, 27); // Dark red
    doc.text('Time', 18, y + 5);
    doc.text('ID', 45, y + 5);
    doc.text('Defect Class', 75, y + 5);
    doc.text('Confidence', 125, y + 5);
    doc.text('Severity', 160, y + 5);

    y += 12;
    doc.setTextColor(30, 41, 59);

    // Limit to recent 20 logs in the PDF
    const logsToShow = defectLogs.slice(-20);
    logsToShow.forEach((log) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }

      const timeStr = new Date(log.timestamp).toLocaleTimeString();
      doc.text(timeStr, 18, y);
      doc.text(log.trackId, 45, y);
      doc.text(log.defectClass || log.className, 75, y);
      doc.text(`${(log.confidence * 100).toFixed(0)}%`, 125, y);
      
      const severity = log.severity || 'minor';
      doc.text(severity.toUpperCase(), 160, y);

      doc.setDrawColor(241, 245, 249);
      doc.line(14, y + 2, 196, y + 2);
      y += 8;
    });
  }

  doc.save(`dashboard-report-${session.id.slice(0, 8)}.pdf`);
}
