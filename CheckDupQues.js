//Use this as a final step to check for duplicate questions in the database. The result will be showed in J column of the sheet.

/**
 * Tự động tạo Menu trên thanh công cụ Google Sheets
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Kiểm tra trùng lặp')
    .addItem('▶Quét trùng lặp & Sai lệch đáp án', 'kiemTraTrungLapVaDapAn')
    .addItem('Xóa ghi chú cột J', 'xoaGhiChuCotJ')
    .addToUi();
}

/**
 * Hàm kiểm tra chính
 */
function kiemTraTrungLapVaDapAn() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('Bảng tính không có dữ liệu để kiểm tra!');
    return;
  }

  // Đọc toàn bộ dữ liệu từ dòng 2 đến hết
  // Cột A -> J tương ứng index 0 -> 9
  const range = sheet.getRange(2, 1, lastRow - 1, 10);
  const values = range.getValues();
  
  // Mảng lưu kết quả ghi chú và màu nền cho Cột J (cột thứ 10)
  const notes = [];
  const backgrounds = [];

  // Từ điển lưu lịch sử các câu hỏi đã xuất hiện trước đó
  // Key: câu hỏi đã chuẩn hóa
  // Value: mảng các lần xuất hiện [{ stt, rowNum, rawAnsKey, ansContent, ansContentRaw }]
  const questionMap = new Map();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const currentRowNum = i + 2; // Số thứ tự dòng thực tế trên Sheet
    const stt = row[0] ? String(row[0]).trim() : `Dòng ${currentRowNum}`;
    const rawQuestion = row[2] ? String(row[2]) : '';
    const normQuestion = normalizeText(rawQuestion);

    // Bỏ qua nếu dòng đó không có câu hỏi
    if (!normQuestion) {
      notes.push(['']);
      backgrounds.push(['#ffffff']);
      continue;
    }

    // Các phương án A, B, C, D (Cột D, E, F, G)
    const options = {
      'A': row[3] ? String(row[3]).trim() : '',
      'B': row[4] ? String(row[4]).trim() : '',
      'C': row[5] ? String(row[5]).trim() : '',
      'D': row[6] ? String(row[6]).trim() : ''
    };

    // Đáp án đúng (Cột H)
    const rawAnsKey = row[7] ? String(row[7]).trim().toUpperCase() : '';
    const currentAnsContentRaw = options[rawAnsKey] || '';
    const currentAnsContentNorm = normalizeText(currentAnsContentRaw);

    let noteText = '';
    let bgColor = '#ffffff';

    if (!questionMap.has(normQuestion)) {
      // Xuất hiện lần đầu tiên -> Lưu lại làm mốc đối chiếu
      questionMap.set(normQuestion, [{
        stt: stt,
        rowNum: currentRowNum,
        rawAnsKey: rawAnsKey,
        ansNorm: currentAnsContentNorm,
        ansRaw: currentAnsContentRaw
      }]);
    } else {
      // Xuất hiện từ lần thứ 2 trở đi -> So sánh với các lần trước
      const previousList = questionMap.get(normQuestion);
      const firstOccur = previousList[0]; // Mốc đầu tiên

      if (currentAnsContentNorm && firstOccur.ansNorm && currentAnsContentNorm === firstOccur.ansNorm) {
        // TRƯỜNG HỢP 1: Trùng câu hỏi và trùng nội dung đáp án (kể cả khi vị trí A, B, C, D bị đảo)
        if (rawAnsKey === firstOccur.rawAnsKey) {
          noteText = `Trùng với câu STT ${firstOccur.stt}`;
        } else {
          noteText = `Trùng với câu STT ${firstOccur.stt} (Đảo đáp án: ${firstOccur.rawAnsKey} -> ${rawAnsKey})`;
        }
        bgColor = '#fff2cc'; // Màu vàng nhạt cảnh báo trùng
      } else {
        // TRƯỜNG HỢP 2: Cùng câu hỏi nhưng sai lệch nội dung đáp án
        const prevText = firstOccur.ansRaw ? `"${firstOccur.ansRaw}"` : `(${firstOccur.rawAnsKey || 'Trống'})`;
        const currText = currentAnsContentRaw ? `"${currentAnsContentRaw}"` : `(${rawAnsKey || 'Trống'})`;
        
        noteText = `Sai lệch đáp án với câu STT ${firstOccur.stt} [STT ${firstOccur.stt}: ${prevText} ≠ Câu này: ${currText}]`;
        bgColor = '#fce5cd'; // Màu cam/đỏ nhạt cảnh báo sai lệch
      }

      // Lưu tiếp vào danh sách xuất hiện
      previousList.push({
        stt: stt,
        rowNum: currentRowNum,
        rawAnsKey: rawAnsKey,
        ansNorm: currentAnsContentNorm,
        ansRaw: currentAnsContentRaw
      });
    }

    notes.push([noteText]);
    backgrounds.push([bgColor]);
  }

  // Ghi kết quả vào Cột J (cột 10)
  const colJRange = sheet.getRange(2, 10, notes.length, 1);
  colJRange.setValues(notes);
  colJRange.setBackgrounds(backgrounds);

  // Đặt tiêu đề nếu ô J1 chưa có
  if (!sheet.getRange(1, 10).getValue()) {
    sheet.getRange(1, 10).setValue('Ghi chú kiểm tra');
    sheet.getRange(1, 10).setFontWeight('bold');
  }

  SpreadsheetApp.getUi().alert('Hoàn tất kiểm tra trùng lặp và sai lệch đáp án!');
}

/**
 * Hàm xóa ghi chú và màu cột J khi muốn reset
 */
function xoaGhiChuCotJ() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const colJRange = sheet.getRange(2, 10, lastRow - 1, 1);
    colJRange.clearContent();
    colJRange.setBackground('#ffffff');
    SpreadsheetApp.getUi().alert('Đã xóa toàn bộ ghi chú cột J!');
  }
}

/**
 * Hàm chuẩn hóa văn bản: xóa khoảng trắng thừa, chữ thường, chuẩn hóa Unicode
 */
function normalizeText(str) {
  if (!str) return '';
  return str
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ');
}