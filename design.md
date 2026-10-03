# design.md

Tài liệu này dạy AI viết giao diện theo style pixel minimalism. Đọc hết trước khi viết dòng code đầu tiên. Khi rule ở đây mâu thuẫn với thói quen mặc định của bạn, rule ở đây thắng.

## 1. Phạm vi: chỉ làm đúng thứ được yêu cầu

Đây là rule quan trọng nhất, đặt trước cả phần thẩm mỹ vì nó là chỗ AI hay phạm lỗi nhất.

Trước khi code, tự viết ra (trong đầu hoặc một dòng ghi chú) danh sách chính xác các tính năng người dùng đã nêu. Chỉ code những thứ nằm trong danh sách đó. Mọi thứ ngoài danh sách là thừa, kể cả khi nó "hợp lý", "chuyên nghiệp" hay "người dùng nào cũng cần".

Các thứ thừa hay gặp mà AI thường tự thêm: thanh điều hướng cho trang chỉ có một màn hình, nút chuyển dark mode, ô tìm kiếm, phân trang, toast thông báo, skeleton loading, hình minh hoạ cho trạng thái rỗng, footer, section giới thiệu, số liệu hay lời chứng thực bịa ra, lưu localStorage, đăng nhập, validation phức tạp hơn mức được nhờ, hiệu ứng chuyển cảnh, menu hamburger. Không làm cái nào trừ khi được yêu cầu rõ ràng.

Khi yêu cầu mơ hồ, chọn cách hiểu nhỏ nhất vẫn chạy được, nói rõ giả định trong một câu, rồi code. Nếu nghĩ ra một tính năng có thể có ích, ghi ở cuối câu trả lời đúng một dòng ("Có thể thêm X nếu bạn cần") và không code nó.

Không tự bịa nội dung. Dùng chữ người dùng cung cấp. Nếu thiếu, dùng nhãn ngắn, trung tính, dễ nhận ra là placeholder, không viết copy quảng cáo.

Không thêm thư viện UI hay framework CSS mới. Dùng công nghệ có sẵn trong dự án, hoặc HTML và CSS thuần nếu dự án trống.

## 2. Ý tưởng cốt lõi

Pixel minimalism ở đây nghĩa là cảm giác pixel đến từ cấu trúc, không đến từ trang trí. Có ba nguồn tạo cảm giác pixel: một font pixel duy nhất, mọi kích thước bám lưới 8px, và mọi cạnh đều vuông, phẳng, không mềm hoá. Phần minimal đến từ việc dùng rất ít màu và rất nhiều khoảng trống.

Vì vậy giao diện không dùng viền, không dùng gradient, không dùng bóng đổ, không bo góc. Phân tách các nhóm nội dung bằng khoảng trắng. Khi thật sự cần một vùng nổi lên, đổi màu nền sang tông bề mặt (surface), phẳng, không viền.

## 3. Token

Khai báo một lần, dùng lại ở mọi nơi. Không viết màu hay số pixel lạ ngoài các token này.

```css
:root {
  --bg: #F2EFE8;
  --surface: #E6E2D8;
  --ink: #1A1A1A;
  --muted: #6B6B6B;
  --accent: #C2300F;

  --font: "Pixelify Sans", ui-monospace, "Courier New", monospace;

  --s1: 8px;
  --s2: 16px;
  --s3: 24px;
  --s4: 32px;
  --s6: 48px;
  --s8: 64px;
  --s12: 96px;
}
```

Màu: chỉ năm màu trên. `--accent` dùng cho tối đa một thành phần nổi bật mỗi màn hình (thường là hành động chính hoặc một trạng thái lỗi). Không thêm màu thứ sáu. Nếu cần dark mode, người dùng sẽ yêu cầu, và khi đó chỉ đảo giá trị token, không đổi cấu trúc.

Độ tương phản: chữ thường phải đạt tối thiểu 4.5:1 theo tiêu chí WCAG 1.4.3 (https://www.w3.org/TR/WCAG22/#contrast-minimum). Bộ màu trên được chọn để đạt mức này, trong đó `--muted` trên `--bg` chỉ vừa đủ, nên không dùng `--muted` cho chữ nhỏ hơn 16px và không đổi sang tông nhạt hơn.

Font: Pixelify Sans (https://fonts.google.com/specimen/Pixelify+Sans), một family duy nhất cho toàn bộ giao diện. Không trộn font thứ hai.

## 4. Chữ

Chỉ dùng bốn cỡ: 16px cho chữ thường, 24px cho tiêu đề phụ, 32px cho tiêu đề chính, 48px cho tiêu đề lớn khi thật sự cần. Font pixel nhìn sắc nhất ở các cỡ đẹp, nên không dùng cỡ lẻ như 17px hay 1.15rem. Line-height 1.5 cho đoạn văn, 1.25 cho tiêu đề. Căn trái mặc định. Chỉ căn giữa khi người dùng yêu cầu. Độ rộng đoạn văn tối đa 60 ký tự (`max-width: 60ch`).

Nhấn mạnh bằng đổi cỡ hoặc đổi màu `--muted`/`--ink`, không dùng in đậm và nghiêng tràn lan. Không viết hoa toàn bộ tiêu đề, không dấu chấm than, không emoji.

## 5. Bố cục và khoảng trống

Dùng nguyên tắc gần gũi: khoảng cách giữa hai nhóm khác nhau phải gấp ít nhất đôi khoảng cách giữa các phần tử trong cùng một nhóm. Trong một nhóm dùng `--s2` (16px). Giữa các nhóm dùng `--s6` đến `--s8`. Giữa các section lớn dùng `--s12`.

Padding ngoài của trang là `--s3` trên mobile và `--s6` từ 768px trở lên. Container có `max-width: 640px` cho nội dung chữ, tối đa 960px cho giao diện dạng công cụ. Một cột là mặc định. Chỉ chia cột khi nội dung thật sự là hai thứ song song (ví dụ danh sách và chi tiết).

Khoảng trống phải rộng hơn bạn cảm thấy cần. Nếu phân vân giữa `--s4` và `--s6`, chọn `--s6`.

Mọi giá trị margin, padding, gap đều lấy từ token. Không viết `margin: 13px`.

## 6. Thành phần

**Nút.** Nền `--ink`, chữ `--bg`, padding `12px 24px`, không viền, không bo góc. Nút chính phụ dùng `--accent` làm nền thay vì `--ink`, và mỗi màn hình chỉ có một nút như vậy. Nút phụ là chữ `--ink` có gạch chân (`text-decoration: underline`), không có nền. Hover: đảo màu nền và chữ, không transition.

**Ô nhập.** Nền `--surface`, không viền, padding `12px 16px`, chữ `--ink`. Label nằm phía trên, cách ô nhập `--s1`, chữ `--muted`. Không dùng placeholder thay cho label.

**Danh sách.** Mỗi mục cách nhau `--s2`, không kẻ dòng, không dấu đầu dòng trang trí. Nếu thứ tự quan trọng, dùng số.

**Bảng.** Không kẻ dòng, không zebra. Padding ô `12px 16px`, tiêu đề cột màu `--muted`, số căn phải. Khoảng trắng làm việc của đường kẻ.

**Nhóm nội dung.** Không bọc trong card. Nếu cần một vùng tách hẳn ra, dùng khối nền `--surface`, phẳng, padding `--s3`, không viền, không bóng, không bo góc.

**Trạng thái focus.** Đây là ngoại lệ duy nhất cho quy tắc "không viền": mọi phần tử tương tác phải có `outline: 2px solid var(--ink); outline-offset: 2px` khi focus bàn phím. Bỏ focus là lỗi khả năng truy cập, không phải tối giản.

**Icon.** Mặc định không dùng icon. Không đặt icon đầu tiêu đề, đầu mục danh sách, hay trong vòng tròn nền màu. Chỉ dùng icon khi một nút không có chữ (ví dụ nút đóng) và người dùng đã yêu cầu nút đó, khi đó dùng icon pixel đặc, 16px, một màu `--ink`.

**Chuyển động.** Mặc định không có. Nếu được yêu cầu, dùng `steps()` thay cho easing mượt, để giữ cảm giác từng bước của pixel.

**Hình ảnh.** Chỉ dùng ảnh người dùng cung cấp. Với ảnh pixel art, thêm `image-rendering: pixelated` để không bị làm mờ khi phóng to. Không tự tạo hình trang trí.

## 7. Tự kiểm tra AI slop trước khi trả code

Sau khi code xong, chạy lệnh sau trên các file giao diện:

```bash
grep -nEi "border|gradient|shadow|radius|blur|backdrop|emoji|opacity" *.css *.html *.jsx *.tsx 2>/dev/null
```

Các kết quả được phép chỉ gồm `border: 0`, `border-radius: 0`, `box-shadow: none` và `outline` cho focus. Mọi kết quả khác là vi phạm, sửa trước khi trả. Nếu dự án dùng Tailwind, tìm các class `border`, `rounded`, `shadow`, `bg-gradient`, `blur`, `backdrop` theo cùng cách.

Sau đó tự đọc lại kết quả như một người phản biện khó tính và trả lời thẳng từng câu hỏi. Có chỗ nào đang dùng viền để tách thứ mà khoảng trắng làm được không. Có gradient, bóng, kính mờ hay góc bo nào lọt vào không. Có icon nào đứng cạnh chữ chỉ để cho đẹp không. Có emoji hay ký tự trang trí nào trong chữ không. Có phần tử nào mà người dùng không hề nhắc tới không, và nếu xoá nó đi thì tính năng đã yêu cầu có hỏng không (nếu không hỏng thì xoá). Có màu nào ngoài năm token không. Có số pixel nào ngoài thang spacing không. Có chỗ nào chật hơn mức một người đang nhìn lướt thấy dễ chịu không.

Nếu bất kỳ câu nào trả lời là "có", sửa rồi kiểm tra lại. Chỉ trả code khi tất cả đều sạch.

## 8. Khi báo cáo

Câu trả lời cuối cùng ngắn: nói đã làm những tính năng nào, nêu giả định nếu có, và tối đa một dòng gợi ý thêm. Không giải thích triết lý thiết kế, không khoe các chọn lựa trong style.
