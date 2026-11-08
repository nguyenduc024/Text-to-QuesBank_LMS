let parsedQuestions = [];
let failedJobs = [];   // các phần bị lỗi của lần chạy gần nhất, để bấm "Xử lý lại phần lỗi"
let lastOptions = null;

// Thư viện đọc/tách PDF, chỉ tải khi có file PDF.
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const PDFLIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';

const CONCURRENCY = 3;            // số phần gửi Gemini cùng lúc (key miễn phí chịu tốt khoảng 2–3)
const QUESTIONS_PER_CHUNK = 25;   // mỗi phần khoảng 25 câu để kết quả không bị cắt cụt
const MAX_CHUNK_CHARS = 12000;
const FALLBACK_CHUNK_CHARS = 8000; // khi không có dấu "Câu ..." để cắt
const FALLBACK_OVERLAP = 1200;     // đoạn chồng giữa 2 phần, câu trùng sẽ được lọc khi gộp
const SCAN_PAGES_PER_CHUNK = 5;    // trang scan: 5 trang một phần, chồng 1 trang
const MIN_TEXT_PER_PAGE = 20;      // trang có ít chữ hơn mức này coi là trang scan

const apiKeyInput = document.getElementById('apiKey');
const modelNameInput = document.getElementById('modelName');
const webhookUrlInput = document.getElementById('webhookUrl');
const subjectNameInput = document.getElementById('subjectName');
const pdfFilesInput = document.getElementById('pdfFiles');
const sourceModeSelect = document.getElementById('sourceMode');
const rawTextInput = document.getElementById('rawText');
const btnProcess = document.getElementById('btnProcess');
const btnRetry = document.getElementById('btnRetry');
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

function setBusy(busy) {
  btnProcess.disabled = busy;
  btnRetry.disabled = busy;
}

btnClear.addEventListener('click', () => {
  rawTextInput.value = '';
  pdfFilesInput.value = '';
  parsedQuestions = [];
  failedJobs = [];
  btnRetry.classList.add('hidden');
  resultSection.classList.add('hidden');
  hideStatus(statusMessage);
  hideStatus(syncStatusMessage);
});

btnProcess.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const modelName = modelNameInput.value.trim() || 'gemini-3.5-flash-lite';
  const rawText = rawTextInput.value.trim();
  const files = [...pdfFilesInput.files];

  if (!apiKey) {
    showStatus(statusMessage, 'Vui lòng nhập Gemini API Key.', true);
    return;
  }

  if (!rawText && !files.length) {
    showStatus(statusMessage, 'Vui lòng chọn file PDF hoặc dán nội dung câu hỏi thô.', true);
    return;
  }

  setBusy(true);
  btnRetry.classList.add('hidden');

  try {
    const jobs = rawText ? jobsFromText(rawText, 'Văn bản dán') : [];
    for (const file of files) {
      showStatus(statusMessage, `Đang đọc ${file.name}...`);
      jobs.push(...await jobsFromPdf(file));
    }
    if (!jobs.length) throw new Error('Không tìm thấy nội dung trong file.');

    parsedQuestions = [];
    await runJobs(jobs, { apiKey, modelName, mode: sourceModeSelect.value });
  } catch (error) {
    showStatus(statusMessage, 'Lỗi xử lý: ' + error.message, true);
  } finally {
    setBusy(false);
  }
});

btnRetry.addEventListener('click', async () => {
  if (!failedJobs.length || !lastOptions) return;
  setBusy(true);
  try {
    await runJobs(failedJobs, lastOptions);
  } finally {
    setBusy(false);
  }
});

// ---------- Chạy các phần song song rồi gộp kết quả ----------

async function runJobs(jobs, options) {
  const results = new Array(jobs.length);
  const failed = [];
  let next = 0;
  let done = 0;
  let found = 0;

  const progress = () => {
    if (jobs.length > 1) {
      showStatus(statusMessage, `Đang trích xuất phần ${done}/${jobs.length} · đã lấy ${found} câu...`);
    } else {
      showStatus(statusMessage, 'Đang trích xuất dữ liệu...');
    }
  };
  progress();

  const worker = async () => {
    while (next < jobs.length) {
      const k = next++;
      try {
        results[k] = await runJob(jobs[k], options);
        found += results[k].length;
      } catch (error) {
        failed.push({ job: jobs[k], error });
      }
      done++;
      progress();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

  // Gộp theo đúng thứ tự trang, bỏ câu trùng ở các đoạn chồng nhau.
  addUnique(results.filter(Boolean).flat());
  failedJobs = failed.map((f) => f.job);
  lastOptions = options;

  renderTable();
  resultSection.classList.toggle('hidden', parsedQuestions.length === 0);
  btnRetry.classList.toggle('hidden', failed.length === 0);

  if (failed.length) {
    showStatus(
      statusMessage,
      `Đã lấy ${parsedQuestions.length} câu. ${failed.length}/${jobs.length} phần bị lỗi:\n` +
        failed.map((f) => `- ${f.job.label}: ${f.error.message}`).join('\n'),
      true
    );
  } else if (jobs.length > 1) {
    showStatus(statusMessage, `Đã lấy ${parsedQuestions.length} câu từ ${jobs.length} phần.`);
  } else {
    hideStatus(statusMessage);
  }
}

async function runJob(job, options) {
  const parts = job.parts || (await job.build());
  const note = cutNote(job);
  const allParts = note ? [...parts, { text: note }] : parts;

  for (let attempt = 1; ; attempt++) {
    try {
      return await extractQuestionsWithGemini(options, allParts);
    } catch (error) {
      if (attempt >= 3 || !error.retryable) throw error;
      await new Promise((r) => setTimeout(r, attempt * 4000));
    }
  }
}

function normalizeKey(s) {
  return String(s || '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function addUnique(questions) {
  const keyOf = (q) => {
    const ans = q['option_' + String(q.correct_answer || '').toLowerCase()];
    return normalizeKey(q.question) + '|' + normalizeKey(ans);
  };
  const seen = new Set(parsedQuestions.map(keyOf));
  for (const q of questions) {
    // Phòng khi Gemini còn để sót dấu [TÔ]/[/TÔ] trong nội dung.
    for (const f of ['question', 'option_a', 'option_b', 'option_c', 'option_d']) {
      if (typeof q[f] === 'string') q[f] = q[f].replace(/\[\/?TÔ\]/g, '').trim();
    }
    const key = keyOf(q);
    if (!normalizeKey(q.question) || seen.has(key)) continue;
    seen.add(key);
    parsedQuestions.push(q);
  }
}

// ---------- Cắt nội dung thành nhiều phần ----------

// Đầu một câu hỏi: "Câu 12", "Câu hỏi 3", "Câu hỏi:", "Question 5" ở đầu dòng.
const QUESTION_START = /^[ \t]*(?:câu(?:[ \t]+hỏi)?[ \t]*\d+|câu[ \t]+hỏi[ \t]*[:.]|question[ \t]*\d+)/gim;

// Trả về các khoảng [start, end). Có dấu đầu câu thì cắt ngay tại đó nên không câu nào bị chia đôi.
// Không có thì cắt theo độ dài tại chỗ xuống dòng / hết câu, các phần chồng lên nhau một đoạn.
function splitText(text) {
  const starts = Array.from(text.matchAll(QUESTION_START), (m) => m.index);

  if (starts.length >= 2) {
    const ranges = [];
    let from = 0;
    let count = 0;
    for (let i = 1; i < starts.length; i++) {
      count++;
      if (count >= QUESTIONS_PER_CHUNK || starts[i] - from >= MAX_CHUNK_CHARS) {
        ranges.push({ start: from, end: starts[i], overlap: false });
        from = starts[i];
        count = 0;
      }
    }
    ranges.push({ start: from, end: text.length, overlap: false });
    return ranges;
  }

  const ranges = [];
  let start = 0;
  while (true) {
    let end = Math.min(start + FALLBACK_CHUNK_CHARS, text.length);
    if (end < text.length) end = findBreak(text, end, start + FALLBACK_CHUNK_CHARS / 2);
    ranges.push({ start, end, overlap: true });
    if (end >= text.length) break;
    start = findBreak(text, end - FALLBACK_OVERLAP, end - FALLBACK_OVERLAP * 2);
  }
  return ranges;
}

// Lùi về chỗ xuống dòng gần nhất, không có thì về dấu chấm, cuối cùng là khoảng trắng.
// Không cắt sau dấu "?" vì với dạng "câu hỏi? kết quả" sẽ tách câu hỏi khỏi kết quả.
function findBreak(text, pos, min) {
  for (let i = pos; i > min; i--) if (text[i - 1] === '\n') return i;
  for (let i = pos; i > min; i--) if ((text[i - 1] === '.' || text[i - 1] === '!') && text[i] === ' ') return i;
  for (let i = pos; i > min; i--) if (text[i - 1] === ' ') return i;
  return pos;
}

function pageLabel(from, to) {
  return from === to ? `trang ${from}` : `trang ${from}–${to}`;
}

function jobsFromText(text, name) {
  const ranges = splitText(text);
  return ranges.map((r, k) => ({
    label: ranges.length > 1 ? `${name} · phần ${k + 1}` : name,
    cutStart: r.overlap && k > 0,
    cutEnd: r.overlap && k < ranges.length - 1,
    parts: [{ text: 'Văn bản thô:\n' + text.slice(r.start, r.end) }]
  }));
}

// PDF: trang có chữ thì lấy chữ rồi cắt theo câu; trang scan thì tách thành file PDF nhỏ cho Gemini đọc ảnh.
async function jobsFromPdf(file) {
  const buf = await file.arrayBuffer();
  const texts = await readPdfText(buf);
  const lastPage = texts.length - 1;

  // Gom các trang liên tiếp cùng loại (có chữ / scan).
  const runs = [];
  texts.forEach((t, i) => {
    const scan = t.replace(/\s+/g, '').length < MIN_TEXT_PER_PAGE;
    const run = runs[runs.length - 1];
    if (run && run.scan === scan) run.end = i;
    else runs.push({ scan, start: i, end: i });
  });

  const jobs = [];
  runs.forEach((run, r) => {
    const hasPrev = r > 0;
    const hasNext = r < runs.length - 1;

    if (!run.scan) {
      // Nối chữ các trang lại rồi mới cắt, nên câu vắt qua 2 trang vẫn nằm trọn trong một phần.
      let text = '';
      const pageStarts = [];
      for (let p = run.start; p <= run.end; p++) {
        pageStarts.push(text.length);
        text += texts[p] + '\n';
      }
      const pageAt = (pos) => {
        let i = pageStarts.length - 1;
        while (i > 0 && pageStarts[i] > pos) i--;
        return run.start + i + 1;
      };
      const ranges = splitText(text);
      ranges.forEach((rg, k) => {
        jobs.push({
          label: `${file.name} · ${pageLabel(pageAt(rg.start), pageAt(Math.max(rg.start, rg.end - 2)))}`,
          cutStart: (rg.overlap && k > 0) || (k === 0 && hasPrev),
          cutEnd: (rg.overlap && k < ranges.length - 1) || (k === ranges.length - 1 && hasNext),
          parts: [{ text: 'Văn bản thô:\n' + text.slice(rg.start, rg.end) }]
        });
      });
      return;
    }

    // Trang scan: lấn thêm 1 trang sang phần kề bên và chồng 1 trang giữa các nhóm,
    // để câu nằm ở chỗ cắt luôn đầy đủ trong ít nhất một phần.
    const first = Math.max(run.start - (hasPrev ? 1 : 0), 0);
    const last = Math.min(run.end + (hasNext ? 1 : 0), lastPage);
    for (let s = first; ; s += SCAN_PAGES_PER_CHUNK - 1) {
      const e = Math.min(s + SCAN_PAGES_PER_CHUNK - 1, last);
      jobs.push({
        label: `${file.name} · ${pageLabel(s + 1, e + 1)} (scan)`,
        cutStart: s > 0,
        cutEnd: e < lastPage,
        build: () => pdfPagesPart(buf, s, e)
      });
      if (e >= last) break;
    }
  });
  return jobs;
}

const scriptLoads = {};
function loadScript(src) {
  if (!scriptLoads[src]) {
    scriptLoads[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => {
        delete scriptLoads[src];
        reject(new Error('Không tải được thư viện đọc PDF, kiểm tra kết nối mạng.'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptLoads[src];
}

// Lấy chữ của từng trang, giữ xuống dòng theo vị trí dòng trong PDF.
async function readPdfText(buf) {
  await loadScript(PDFJS_URL);
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  // pdf.js chuyển dữ liệu sang worker nên đưa bản sao, giữ bản gốc cho bước tách trang scan.
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  try {
    return await Promise.all(
      Array.from({ length: doc.numPages }, async (_, i) => {
        const page = await doc.getPage(i + 1);
        const [content, annotations] = await Promise.all([page.getTextContent(), page.getAnnotations()]);
        page.cleanup();
        const marks = markBoxes(annotations);
        let out = '';
        let lastY = null;
        let inMark = false;
        for (const item of content.items) {
          if (item.str === undefined) continue;
          const y = item.transform[5];
          const marked = marks.length > 0 && item.str.trim() !== '' && isMarked(item, marks);
          if (inMark && !marked && item.str.trim() !== '') { out += MARK_END; inMark = false; }
          if (lastY !== null && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) {
            if (inMark) { out += MARK_END; inMark = false; }
            out += '\n';
          }
          if (marked && !inMark) { out += MARK_START; inMark = true; }
          out += item.str;
          if (item.hasEOL) {
            if (inMark) { out += MARK_END; inMark = false; }
            if (!out.endsWith('\n')) out += '\n';
          }
          lastY = y;
        }
        if (inMark) out += MARK_END;
        return out;
      })
    );
  } finally {
    doc.destroy();
  }
}

// Vùng người dùng tô/đánh dấu trong trình đọc PDF (Highlight, gạch chân, bút vẽ, khoanh).
const MARK_START = '[TÔ]';
const MARK_END = '[/TÔ]';
const MARK_TYPES = new Set(['Highlight', 'Underline', 'Squiggly', 'Ink', 'Square', 'Circle']);

function markBoxes(annotations) {
  const boxes = [];
  for (const a of annotations) {
    if (!MARK_TYPES.has(a.subtype)) continue;
    const q = a.quadPoints;
    if (q && q.length) {
      if (typeof q[0] === 'number') {
        // pdf.js mới: mảng phẳng, mỗi vùng 8 số.
        for (let k = 0; k + 7 < q.length; k += 8) {
          const xs = [q[k], q[k + 2], q[k + 4], q[k + 6]];
          const ys = [q[k + 1], q[k + 3], q[k + 5], q[k + 7]];
          boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
        }
      } else {
        // pdf.js 3.x: mỗi vùng là 4 điểm {x, y}.
        for (const pts of q) {
          const xs = pts.map(p => p.x);
          const ys = pts.map(p => p.y);
          boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
        }
      }
    } else if (a.rect) {
      const [x1, y1, x2, y2] = a.rect;
      boxes.push([Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]);
    }
  }
  return boxes;
}

// Một đoạn chữ được tính là đã tô khi tâm theo chiều dọc nằm trong vùng tô
// và hơn nửa bề ngang nằm trong vùng đó.
function isMarked(item, boxes) {
  const x = item.transform[4];
  const y = item.transform[5];
  const w = item.width || 0;
  const h = item.height || Math.abs(item.transform[3]) || 10;
  const cy = y + h / 2;
  for (const [x1, y1, x2, y2] of boxes) {
    if (cy < y1 - 1 || cy > y2 + 1) continue;
    const overlap = Math.min(x + w, x2) - Math.max(x, x1);
    if (w === 0 ? x >= x1 && x <= x2 : overlap > w / 2) return true;
  }
  return false;
}

// Mỗi file chỉ nạp vào pdf-lib một lần, dùng chung cho các nhóm trang.
const pdfLibDocs = new WeakMap();
async function pdfPagesPart(buf, from, to) {
  await loadScript(PDFLIB_URL);
  if (!pdfLibDocs.has(buf)) pdfLibDocs.set(buf, PDFLib.PDFDocument.load(buf, { ignoreEncryption: true }));
  const src = await pdfLibDocs.get(buf);

  const out = await PDFLib.PDFDocument.create();
  const indices = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  for (const page of await out.copyPages(src, indices)) out.addPage(page);
  const bytes = await out.save();

  return [
    { inline_data: { mime_type: 'application/pdf', data: await toBase64(bytes) } },
    { text: 'Trích xuất các câu hỏi trong file PDF đính kèm.' }
  ];
}

function toBase64(bytes) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes]));
  });
}

function cutNote(job) {
  const where = [job.cutStart && 'đầu', job.cutEnd && 'cuối'].filter(Boolean);
  if (!where.length) return '';
  return `Lưu ý: đây là một phần cắt ra từ tài liệu dài, phần ${where.join(' và ')} có thể chứa câu hỏi bị cắt dở. ` +
    'Chỉ bỏ qua câu rõ ràng bị thiếu (mất đầu câu hỏi, hoặc chưa có phương án/kết quả); câu đầy đủ thì giữ lại.';
}

// ---------- Gemini ----------

const MCQ_INSTRUCTION =
  'Bạn là chuyên gia trích xuất và làm sạch dữ liệu đề thi trắc nghiệm. Hãy nhận diện nội dung câu hỏi, loại bỏ hoàn toàn các dòng rác hệ thống (như Đạt điểm, Không gắn cờ, Đoạn văn câu hỏi, Select one...). Xác định đáp án đúng dựa vào thông tin điểm số (nếu đạt 1.00/1.00 thì phương án đã chọn là đáp án đúng) hoặc dòng phản hồi đáp án. ' +
  'Nếu là đề thi dạng PDF, đáp án đúng có thể nằm ở dòng "Đáp án", được đánh dấu (dấu *, in đậm, tô màu, gạch chân) hoặc nằm trong bảng đáp án cuối tài liệu. ' +
  'Phần chữ nằm giữa [TÔ] và [/TÔ] là chỗ người dùng đã tô đánh dấu trong PDF: phương án được tô chính là đáp án đúng, ưu tiên dấu này hơn mọi suy đoán. Khi chép nội dung thì bỏ hai dấu [TÔ], [/TÔ]. ' +
  'Chép nguyên văn nội dung, không tự sửa chữ; bỏ tiền tố như "Câu 1:" và ký hiệu "A." ở đầu phương án. Bỏ qua tiêu đề, số trang và các dòng không phải câu hỏi.';

const QA_INSTRUCTION =
  'Bạn là chuyên gia soạn đề trắc nghiệm. Tài liệu chỉ gồm các câu hỏi và kết quả đúng của từng câu, không có phương án lựa chọn. ' +
  'Kết quả có thể nằm ngay sau dấu "?", sau "->" hoặc "→", sau dấu ":" hoặc chữ "Đáp án"/"Trả lời". Phần chữ nằm giữa [TÔ] và [/TÔ] là chỗ người dùng đã tô đánh dấu: đó là kết quả đúng; khi chép thì bỏ hai dấu này.Nhiều câu có thể viết liền nhau không xuống dòng: hãy dựa vào nghĩa để tách đúng chỗ kết thúc kết quả của câu trước và chỗ bắt đầu câu hỏi tiếp theo. ' +
  'Chép nguyên văn câu hỏi và kết quả, không sửa chữ; bỏ tiền tố như "Câu 1:", "Câu hỏi:" và các ký hiệu "->", "→". ' +
  'Với mỗi câu, tạo đúng 3 phương án sai: cùng chủ đề, cùng kiểu và độ dài gần với kết quả đúng, nghe hợp lý nhưng chắc chắn sai, không trùng nhau và không trùng kết quả đúng. ' +
  'Bỏ qua tiêu đề, số trang và các dòng không phải câu hỏi.';

const MCQ_SCHEMA = {
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
};

const QA_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      question: { type: 'STRING', description: 'Nội dung câu hỏi, chép nguyên văn' },
      answer: { type: 'STRING', description: 'Kết quả đúng, chép nguyên văn' },
      wrong_options: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        minItems: 3,
        maxItems: 3,
        description: '3 phương án sai do bạn tạo'
      },
      note: { type: 'STRING', description: 'Ghi chú ngắn nếu có' }
    },
    required: ['question', 'answer', 'wrong_options']
  }
};

async function extractQuestionsWithGemini({ apiKey, modelName, mode }, parts) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const qa = mode === 'qa';

  const payload = {
    systemInstruction: { parts: [{ text: qa ? QA_INSTRUCTION : MCQ_INSTRUCTION }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: qa ? 0.4 : 0,
      responseMimeType: 'application/json',
      responseSchema: qa ? QA_SCHEMA : MCQ_SCHEMA
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
    const error = new Error(`Mã lỗi ${response.status}: ${errBody.slice(0, 300)}`);
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }

  const result = await response.json();
  const candidate = result.candidates?.[0];
  const textOutput = (candidate?.content?.parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('');

  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('Kết quả quá dài nên bị cắt cụt.');
  }
  if (!textOutput) {
    const error = new Error('Mô hình không trả về nội dung hợp lệ.');
    error.retryable = true;
    throw error;
  }

  let items;
  try {
    items = JSON.parse(textOutput);
  } catch {
    const error = new Error('Kết quả trả về sai định dạng.');
    error.retryable = true;
    throw error;
  }
  return qa ? items.map(qaToMcq) : items.map(cleanMcq);
}

function cleanMcq(item) {
  const letter = String(item.correct_answer || '').trim().toUpperCase().charAt(0);
  const ok = 'ABCD'.includes(letter) && letter;
  return {
    ...item,
    correct_answer: ok ? letter : '',
    note: ok ? item.note || '' : [item.note, 'Chưa rõ đáp án'].filter(Boolean).join(' · ')
  };
}

// Câu hỏi + kết quả -> 4 phương án, đáp án đúng nằm ở vị trí ngẫu nhiên.
function qaToMcq(item) {
  const answer = String(item.answer || '').trim();
  const seen = new Set([normalizeKey(answer)]);
  const wrong = [];
  for (const w of item.wrong_options || []) {
    const text = String(w).trim();
    const key = normalizeKey(text);
    if (text && !seen.has(key) && wrong.length < 3) {
      seen.add(key);
      wrong.push(text);
    }
  }

  const options = [answer, ...wrong];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  while (options.length < 4) options.push('');

  const notes = [item.note, 'AI tạo phương án sai'];
  if (wrong.length < 3) notes.push('Thiếu phương án, cần bổ sung');

  return {
    question: String(item.question || '').trim(),
    option_a: options[0],
    option_b: options[1],
    option_c: options[2],
    option_d: options[3],
    correct_answer: 'ABCD'[options.indexOf(answer)],
    note: notes.filter(Boolean).join(' · ')
  };
}

function renderTable() {
  const fragment = document.createDocumentFragment();

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

    fragment.appendChild(tr);
  });

  questionsTbody.replaceChildren(fragment);
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
