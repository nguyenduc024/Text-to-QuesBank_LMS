let parsedQuestions = [];

const apiKeyInput = document.getElementById('apiKey');
const modelNameInput = document.getElementById('modelName');
const webhookUrlInput = document.getElementById('webhookUrl');
const subjectNameInput = document.getElementById('subjectName');
const rawTextInput = document.getElementById('rawText');
const btnProcess = document.getElementById('btnProcess');
const btnClear = document.getElementById('btnClear');
const statusMessage = document.getElementById('statusMessage');

const resultSection = document.getElementById('resultSection');
const questionsTbody = document.getElementById('questionsTbody');
const btnSyncSheet = document.getElementById('btnSyncSheet');
const btnCopyTsv = document.getElementById('btnCopyTsv');
const syncStatusMessage = document.getElementById('syncStatusMessage');

function showStatus(element, text, isError = false) {
  element.textContent = text;
  element.classList.remove('hidden');
  if (isError) {
    element.classList.add('error');
  } else {
    element.classList.remove('error');
  }
}

function hideStatus(element) {
  element.textContent = '';
  element.classList.add('hidden');
  element.classList.remove('error');
}

btnClear.addEventListener('click', () => {
  rawTextInput.value = '';
  parsedQuestions = [];
  resultSection.classList.add('hidden');
  hideStatus(statusMessage);
  hideStatus(syncStatusMessage);
});

btnProcess.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const modelName = modelNameInput.value.trim() || 'gemini-3.5-flash-lite';
  const rawText = rawTextInput.value.trim();

  if (!apiKey) {
    showStatus(statusMessage, 'Vui lòng nhập Gemini API Key.', true);
    return;
  }

  if (!rawText) {
    showStatus(statusMessage, 'Vui lòng dán nội dung câu hỏi thô.', true);
    return;
  }

  showStatus(statusMessage, 'Đang trích xuất dữ liệu...');
  btnProcess.disabled = true;

  try {
    const questions = await extractQuestionsWithGemini(apiKey, modelName, rawText);
    parsedQuestions = questions;
    renderTable();
    hideStatus(statusMessage);
    resultSection.classList.remove('hidden');
  } catch (error) {
    showStatus(statusMessage, 'Lỗi xử lý: ' + error.message, true);
  } finally {
    btnProcess.disabled = false;
  }
});

async function extractQuestionsWithGemini(apiKey, modelName, rawText) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const systemInstruction = 'Bạn là chuyên gia trích xuất và làm sạch dữ liệu đề thi trắc nghiệm. Hãy nhận diện nội dung câu hỏi, loại bỏ hoàn toàn các dòng rác hệ thống (như Đạt điểm, Không gắn cờ, Đoạn văn câu hỏi, Select one...). Xác định đáp án đúng dựa vào thông tin điểm số (nếu đạt 1.00/1.00 thì phương án đã chọn là đáp án đúng) hoặc dòng phản hồi đáp án.';

  const payload = {
    contents: [
      {
        parts: [
          {
            text: `Hệ thống hướng dẫn: ${systemInstruction}\n\nVăn bản thô:\n${rawText}`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING', description: 'Nội dung câu hỏi đã làm sạch' },
            option_a: { type: 'STRING', description: 'Phương án A' },
            option_b: { type: 'STRING', description: 'Phương án B' },
            option_c: { type: 'STRING', description: 'Phương án C' },
            option_d: { type: 'STRING', description: 'Phương án D' },
            correct_answer: { type: 'STRING', description: 'Đáp án đúng (A, B, C, hoặc D)' },
            note: { type: 'STRING', description: 'Ghi chú hoặc giải thích ngắn gọn nếu có' }
          },
          required: ['question', 'option_a', 'option_b', 'correct_answer']
        }
      }
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Mã lỗi ${response.status}: ${errBody}`);
  }

  const result = await response.json();
  const textOutput = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textOutput) {
    throw new Error('Mô hình không trả về nội dung hợp lệ.');
  }

  return JSON.parse(textOutput);
}

function renderTable() {
  questionsTbody.innerHTML = '';

  parsedQuestions.forEach((item, index) => {
    const tr = document.createElement('tr');

    const tdIndex = document.createElement('td');
    tdIndex.className = 'num';
    tdIndex.textContent = (index + 1).toString();

    const fields = [
      { key: 'question', td: document.createElement('td') },
      { key: 'option_a', td: document.createElement('td') },
      { key: 'option_b', td: document.createElement('td') },
      { key: 'option_c', td: document.createElement('td') },
      { key: 'option_d', td: document.createElement('td') },
      { key: 'correct_answer', td: document.createElement('td') },
      { key: 'note', td: document.createElement('td') }
    ];

    fields.forEach(f => {
      f.td.textContent = item[f.key] || '';
      f.td.contentEditable = 'false';
      f.td.addEventListener('blur', (e) => {
        let val = e.target.textContent;
        if (f.key === 'correct_answer') val = val.trim().toUpperCase();
        item[f.key] = val;
      });
      tr.appendChild(f.td);
    });

    const tdAction = document.createElement('td');
    tdAction.style.display = 'flex';
    tdAction.style.gap = 'var(--s1)';

    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'btn-icon';
    btnEdit.innerHTML = `<svg class="icon-edit" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M10 2l4 4-8 8H2v-4l8-8z"/></svg>`;
    
    let isEditing = false;
    btnEdit.addEventListener('click', () => {
      isEditing = !isEditing;
      fields.forEach(f => {
        f.td.contentEditable = isEditing ? 'true' : 'false';
        if (isEditing) {
          f.td.classList.add('editable');
        } else {
          f.td.classList.remove('editable');
        }
      });
      
      if (isEditing) {
        btnEdit.innerHTML = `<svg class="icon-save" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M2 8l4 4 8-8-2-2-6 6-2-2-2 2z"/></svg>`;
        fields[0].td.focus();
      } else {
        btnEdit.innerHTML = `<svg class="icon-edit" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M10 2l4 4-8 8H2v-4l8-8z"/></svg>`;
      }
    });

    const btnDelete = document.createElement('button');
    btnDelete.type = 'button';
    btnDelete.className = 'btn-icon';
    btnDelete.innerHTML = `<svg class="icon-trash" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M6 2h4v2H2v2h12V4h-8V2zm-2 4h8v8H4V6z"/></svg>`;
    btnDelete.addEventListener('click', () => {
      parsedQuestions.splice(index, 1);
      renderTable();
    });

    tdAction.appendChild(btnEdit);
    tdAction.appendChild(btnDelete);

    tr.insertBefore(tdIndex, fields[0].td);
    tr.appendChild(tdAction);

    questionsTbody.appendChild(tr);
  });
}

btnCopyTsv.addEventListener('click', () => {
  if (parsedQuestions.length === 0) return;

  const subject = subjectNameInput.value.trim();
  const headers = ['STT', 'Môn học', 'Câu hỏi', 'Phương án A', 'Phương án B', 'Phương án C', 'Phương án D', 'Đáp án đúng', 'Ghi chú'];
  
  const rows = parsedQuestions.map((q, idx) => [
    idx + 1,
    subject,
    `"${(q.question || '').replace(/"/g, '""')}"`,
    `"${(q.option_a || '').replace(/"/g, '""')}"`,
    `"${(q.option_b || '').replace(/"/g, '""')}"`,
    `"${(q.option_c || '').replace(/"/g, '""')}"`,
    `"${(q.option_d || '').replace(/"/g, '""')}"`,
    q.correct_answer || '',
    `"${(q.note || '').replace(/"/g, '""')}"`
  ]);

  const tsvContent = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
  navigator.clipboard.writeText(tsvContent).then(() => {
    showStatus(syncStatusMessage, 'Đã sao chép toàn bộ bảng vào bộ nhớ tạm. Bạn có thể dán trực tiếp vào Google Sheet.');
  }).catch((err) => {
    showStatus(syncStatusMessage, 'Lỗi sao chép: ' + err.message, true);
  });
});

btnSyncSheet.addEventListener('click', async () => {
  const webhookUrl = webhookUrlInput.value.trim();
  const subject = subjectNameInput.value.trim();

  if (!webhookUrl) {
    showStatus(syncStatusMessage, 'Vui lòng nhập Google Apps Script Webhook URL để gửi dữ liệu.', true);
    return;
  }

  if (parsedQuestions.length === 0) {
    showStatus(syncStatusMessage, 'Không có câu hỏi nào để gửi.', true);
    return;
  }

  showStatus(syncStatusMessage, 'Đang gửi dữ liệu vào Google Sheet...');
  btnSyncSheet.disabled = true;

  try {
    const payload = {
      subject: subject,
      questions: parsedQuestions
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (result.status === 'error') {
      throw new Error(result.message);
    }

    let msg = `Đã ghi thành công ${result.insertedCount} câu vào Google Sheet.`;
    if (result.sheetName) {
      msg = `Đã ghi thành công ${result.insertedCount} câu vào trang "${result.sheetName}"` +
        (result.sheetCreated ? ' (trang mới được tạo).' : '.');
    }
    if (result.messages && result.messages.length > 0) {
      msg += '\n\nCảnh báo:\n' + result.messages.join('\n');
    }

    showStatus(syncStatusMessage, msg);
  } catch (error) {
    showStatus(syncStatusMessage, 'Lỗi khi gửi vào Google Sheet: ' + error.message, true);
  } finally {
    btnSyncSheet.disabled = false;
  }
});
