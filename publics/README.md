# Trang public OfficeHQ

Project Docusaurus cho nội dung công khai. Tài liệu hiển thị nằm trong `docs/`; tài liệu nội bộ ở `../study-cases/` không tự động được publish. Chỉ đưa nội dung đã duyệt vào `docs/`.

## Chạy trên máy

Yêu cầu Node.js 20 trở lên.

```sh
cd publics
npm ci
npm run start
```

Kiểm tra bản build bằng `npm run build` và `npm run serve`.

## GitHub Pages

Workflow `.github/workflows/pages.yml` build khi có pull request và deploy khi push lên `main`. Trong repository GitHub, vào **Settings → Pages → Build and deployment → Source**, chọn **GitHub Actions**. Sau khi push, trang dự kiến ở `https://anthony-phil-officehq.github.io/Anthony-survivor/`.
