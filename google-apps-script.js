/**
 * Nhận câu hỏi từ web HUB và ghi vào Google Sheet.
 *
 * File này nằm CHUNG dự án Apps Script với Code.gs của web LMS (cùng 1 file Sheet).
 * Một dự án chỉ có được 1 hàm doPost, nên doPost nằm ở Code.gs và tự chuyển
 * dữ liệu của HUB (có "questions", không có "action") sang hàm này.
 */
function importQuestions(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    // Chọn trang tính theo tên môn: mỗi môn 1 tab trong cùng file Sheet
    var target = getTargetSheet(data.subject);
    var sheet = target.sheet;
    
    // Nếu sheet rỗng, thêm tiêu đề cột
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "STT", "Môn học / Đề", "Câu hỏi", "Phương án A", "Phương án B", "Phương án C", "Phương án D", "Đáp án đúng", "Ghi chú"
      ]);
    }
    
    var subject = data.subject || "";
    var newQuestions = data.questions || [];
    
    var lastRow = sheet.getLastRow();
    var existingData = [];
    var nextSTT = 1;
    var realLastRow = 1;
    
    if (lastRow > 1) {
      existingData = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
      // Tìm dòng cuối cùng thực sự có dữ liệu (bỏ qua các dòng lỡ tay gõ space)
      for (var r = existingData.length - 1; r >= 0; r--) {
        var cellSTT = existingData[r][0].toString().trim();
        var cellQ = existingData[r][2].toString().trim();
        if (cellSTT !== "" || cellQ !== "") {
          realLastRow = r + 2; // r=0 tức là row 2 trong sheet
          var parsedSTT = parseInt(cellSTT, 10);
          if (!isNaN(parsedSTT)) {
            nextSTT = parsedSTT + 1;
          }
          break;
        }
      }
    }
    
    var messages = [];
    var rowsToInsert = [];
    
    for (var i = 0; i < newQuestions.length; i++) {
      var q = newQuestions[i];
      var isExactDuplicate = false;
      var isConflict = false;
      var conflictSTT = "";
      
      var qText = (q.question || "").toString().trim().toLowerCase();
      var qOptA = (q.option_a || "").toString().trim().toLowerCase();
      var qOptB = (q.option_b || "").toString().trim().toLowerCase();
      var qOptC = (q.option_c || "").toString().trim().toLowerCase();
      var qOptD = (q.option_d || "").toString().trim().toLowerCase();
      var qAns = (q.correct_answer || "").toString().trim().toLowerCase();
      
      for (var j = 0; j < existingData.length; j++) {
        var exSTT = existingData[j][0] || ("dòng " + (j + 2));
        var exQ = (existingData[j][2] || "").toString().trim().toLowerCase();
        var exOptA = (existingData[j][3] || "").toString().trim().toLowerCase();
        var exOptB = (existingData[j][4] || "").toString().trim().toLowerCase();
        var exOptC = (existingData[j][5] || "").toString().trim().toLowerCase();
        var exOptD = (existingData[j][6] || "").toString().trim().toLowerCase();
        var exAns = (existingData[j][7] || "").toString().trim().toLowerCase();
        
        // 1. Phải trùng CÂU HỎI
        if (qText !== "" && qText === exQ) {
          // 2. Phải trùng TẤT CẢ CÁC PHƯƠNG ÁN thì mới xét tiếp (để tránh các câu như "Chọn câu đúng:")
          if (qOptA === exOptA && qOptB === exOptB && qOptC === exOptC && qOptD === exOptD) {
            // 3. Nếu trùng đáp án -> Trùng hoàn toàn
            if (qAns === exAns) {
              isExactDuplicate = true;
              conflictSTT = exSTT;
              break;
            } else {
              // 4. Nếu khác đáp án -> Báo xem lại
              isConflict = true;
              conflictSTT = exSTT;
              break;
            }
          }
        }
      }
      
      if (isExactDuplicate) {
        var msg = "Trùng hoàn toàn với STT " + conflictSTT;
        messages.push("Câu " + (i + 1) + ": " + msg);
        q.note = q.note ? (q.note + "\n[CẢNH BÁO: " + msg + "]") : "[CẢNH BÁO: " + msg + "]";
      } else if (isConflict) {
        var msg = "Trùng câu hỏi, khác đáp án với STT " + conflictSTT;
        messages.push("Câu " + (i + 1) + ": " + msg);
        q.note = q.note ? (q.note + "\n[CẢNH BÁO: " + msg + "]") : "[CẢNH BÁO: " + msg + "]";
      }
      
      var newRow = [
        nextSTT++,
        subject,
        q.question || "",
        q.option_a || "",
        q.option_b || "",
        q.option_c || "",
        q.option_d || "",
        q.correct_answer || "",
        q.note || ""
      ];
      rowsToInsert.push(newRow);
      existingData.push(newRow); // Cập nhật cache để check các câu kế tiếp
    }
    
    if (rowsToInsert.length > 0) {
      sheet.getRange(realLastRow + 1, 1, rowsToInsert.length, 9).setValues(rowsToInsert);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      insertedCount: rowsToInsert.length,
      messages: messages,
      sheetName: sheet.getName(),
      sheetCreated: target.created
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Các trang lịch sử làm bài của web LMS, không được ghi câu hỏi vào đây
var RESERVED_SHEETS = ["log_exam", "log_practice"];

/**
 * Tìm trang tính (tab) có tên trùng với tên môn, không phân biệt hoa thường.
 * Chưa có thì tạo tab mới với tên đó (dòng tiêu đề sẽ được thêm ở doPost như cũ).
 * Không nhập tên môn thì dùng trang đang mở như trước đây.
 */
function getTargetSheet(subject) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = toSheetName(subject);
  if (!name) return { sheet: ss.getActiveSheet(), created: false };

  if (RESERVED_SHEETS.indexOf(name.toLowerCase()) !== -1) {
    throw new Error('Không thể dùng tên "' + name + '" vì đây là trang lưu lịch sử làm bài.');
  }

  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toLowerCase() === name.toLowerCase()) {
      return { sheet: sheets[i], created: false };
    }
  }
  return { sheet: ss.insertSheet(name), created: true };
}

// Tên tab của Google Sheet không được chứa : \ / ? * [ ] và tối đa 100 ký tự
function toSheetName(subject) {
  return String(subject || "")
    .replace(/[:\\\/?*\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}
