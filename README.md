# Ngân hàng câu hỏi từ LMS HUB (HUB Question Bank Filler)

Công cụ dựa trên nền tảng web giúp tự động trích xuất, làm sạch và tổ chức dữ liệu câu hỏi trắc nghiệm thô từ hệ thống LMS HUB. Công cụ sử dụng sức mạnh của Google Gemini API để phân tích văn bản, loại bỏ các thông tin rác và xuất ra định dạng bảng chuẩn xác.

## Tính năng nổi bật

*   **Trích xuất thông minh:** Tự động nhận diện câu hỏi, các phương án A, B, C, D và đáp án đúng từ văn bản thô có chứa các dòng rác của hệ thống LMS (như "Đạt điểm", "Không gắn cờ", "Select one...", v.v.).
*   **Giao diện tối giản (Pixel Minimalism):** Thiết kế chú trọng vào nội dung và cấu trúc, loại bỏ các chi tiết trang trí thừa, mang lại trải nghiệm sử dụng tập trung, nhanh và nhẹ.
*   **Chỉnh sửa trực tiếp:** Cho phép chỉnh sửa lại nội dung các câu hỏi, đáp án ngay trên bảng kết quả sau khi AI xử lý xong.
*   **Xuất dữ liệu linh hoạt:**
    *   **Sao chép dạng bảng:** Sao chép dữ liệu dưới dạng TSV để dán trực tiếp vào Excel hoặc Google Sheets.
    *   **Đồng bộ Google Sheets:** Hỗ trợ gửi dữ liệu trực tiếp vào Google Sheets thông qua Google Apps Script Webhook.

## Cách sử dụng

1.  **Chạy ứng dụng:** Mở file `index.html` bằng bất kỳ trình duyệt web hiện đại nào. (Không cần cài đặt thêm phần mềm/thư viện nào).
2.  **Cài đặt Webhub Question Bank**: Hướng dẫn ở phần dưới
3.  **Cấu hình:**
    *   **Gemini API Key:** Nhập khóa API Gemini của bạn.
    *   **Tên mô hình:** Mặc định là `gemini-3.5-flash-lite`, bạn có thể đổi sang các mô hình khác (ví dụ: `gemini-pro`).
    *   **Google Apps Script Webhook URL:** (Tùy chọn) Nhập URL Webhook nếu bạn muốn sử dụng tính năng đồng bộ trực tiếp lên Google Sheets.
    *   **Tên môn học:** Điền tên môn học để gán nhãn cho các câu hỏi khi xuất dữ liệu.
4.  **Xử lý dữ liệu:**
    *   Dán nội dung bài thi/câu hỏi thô copy từ LMS HUB vào ô "Văn bản thô từ bài làm".
    *   Nhấn nút **Xử lý câu hỏi** và chờ hệ thống phân tích.
5.  **Kiểm tra và Xuất:**
    *   Kiểm tra lại dữ liệu trong bảng kết quả. Bạn có thể bấm vào biểu tượng ✏️ để sửa hoặc biểu tượng 🗑️ để xóa câu hỏi.
    *   Dùng nút **Sao chép dạng bảng** hoặc **Gửi vào Google Sheet** để lưu lại thành quả.
6. **Sau khi có Question Bank:**
    *   Paste code từ file `CheckDupQues.js` và deploy tương tự bước đầu triển khai Webhook.
    *   Sau khi nhấn deploy, quay lại trang GG Sheet chứa Question Bank và tải lại trang, sau đó sẽ xuất hiện 1 tab mới trên thanh công cụ: Kiểm tra trùng lặp. Code sẽ tự chạy kiểm tra và hiển thị kết quả ở cột J.

## Hướng dẫn cài đặt Google Apps Script (Để đồng bộ Sheets)

Nếu bạn muốn dùng tính năng **Gửi vào Google Sheet**, bạn cần thiết lập Webhook theo các bước sau:

1.  Tạo một bảng tính (Spreadsheet) mới trên Google Sheets.
2.  Trên thanh menu của Google Sheets, chọn **Tiện ích mở rộng (Extensions)** > **Apps Script**.
3.  Xóa đoạn mã mặc định và dán toàn bộ nội dung của file `google-apps-script.js` vào trình chỉnh sửa.
4.  Nhấn **Lưu** (biểu tượng đĩa mềm hoặc `Ctrl + S` / `Cmd + S`).
5.  Bấm vào nút **Triển khai (Deploy)** ở góc trên bên phải > Chọn **Tùy chọn triển khai mới (New deployment)**.
6.  Nhấp vào biểu tượng bánh răng ở mục "Chọn loại" (Select type), tích chọn **Ứng dụng web (Web app)**.
7.  Thiết lập các cấu hình sau:
    *   **Mô tả:** Nhập tên gợi nhớ (VD: `QuesBank Webhook`).
    *   **Chạy ứng dụng dưới dạng (Execute as):** `Tôi (Me)`.
    *   **Người có quyền truy cập (Who has access):** Bắt buộc chọn `Bất kỳ ai (Anyone)`.
8.  Bấm **Triển khai (Deploy)**. *(Lưu ý: Google sẽ yêu cầu bạn cấp quyền truy cập lần đầu. Hãy chọn tài khoản của bạn > Nhấn "Nâng cao" (Advanced) > Chọn "Đi tới dự án..." (Go to...))*
9.  Sau khi hoàn tất, copy đường link **URL ứng dụng web (Web app URL)**.
10. Dán URL đó vào ô **Google Apps Script Webhook URL** trên giao diện công cụ của bạn.

## Công nghệ sử dụng

*   **Frontend:** HTML5, CSS3, JavaScript thuần (Vanilla JS).
*   **Tích hợp AI:** Google Gemini API (thông qua REST API).
*   **Font chữ:** Pixelify Sans (Google Fonts).

## Cấu trúc thư mục

*   `index.html`: Giao diện chính của công cụ.
*   `app.js`: Xử lý logic, gọi API Gemini, render bảng và xử lý sự kiện.
*   `style.css`: Chứa các quy tắc định dạng theo phong cách Pixel Minimalism.
*   `design.md`: Tài liệu quy chuẩn thiết kế giao diện của dự án.
*   `google-apps-script.js`: (Tùy chọn) Script để triển khai trên Google Apps Script, nhận dữ liệu webhook từ công cụ và ghi vào Google Sheets.
*   `logo_icon.png`: Icon của ứng dụng.
