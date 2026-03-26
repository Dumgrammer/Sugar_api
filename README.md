# Sugar API

Backend API for the Sugar Cafe system. This service handles authentication, menu management, payment and order workflows, and analytics/report export.

## Stack

- Node.js + Express
- TypeScript (runtime via `ts-node`)
- MongoDB + Mongoose
- JWT authentication
- Argon2 password hashing
- Multer file uploads
- PDFKit (analytics export to PDF)
- Zod validation

## Prerequisites

- Node.js 20+
- npm
- MongoDB Atlas cluster (or any MongoDB URI)
- Google Cloud SDK (`gcloud`) for Cloud Run deployment (optional)

## Environment Variables

Create a `.env` file in the API root:

```env
PORT=3000
JWT_SECRET=your_jwt_secret_here
MONGO_URI=mongodb+srv://<db_user>:<db_password>@<cluster>.mongodb.net/<db_name>?retryWrites=true&w=majority
```

Notes:

- `JWT_SECRET` is required for login and protected routes.
- `MONGO_URI` must include the database name (`/<db_name>`).
- In Cloud Run, `PORT` is injected by the platform.

## Run Locally

Install dependencies:

```bash
npm install
```

Start server:

```bash
npm run start
```

Health check:

```http
GET http://localhost:3000/
```

Seed sample menu data:

```bash
npm run seed:menu
```

## CORS

Allowed origins are configured in `app.ts`:

- `http://localhost:5173`
- `https://project-sugar.vercel.app`

## Authentication and Roles

JWT tokens are issued on login and must be sent as:

```http
Authorization: Bearer <token>
```

Role rules:

- `requireAdminOrSuperAdmin`: accepts `admin` and `super_admin`
- `requireSuperAdmin`: only accepts `super_admin`

## API Endpoints

Base URL (local): `http://localhost:3000`

### Root

- `GET /` - API heartbeat (`Sugar API is running`)

### Super Admin

- `POST /super-admins` - Create super admin
- `POST /super-admins/login` - Login super admin

### Admin

- `POST /admins` - Create admin (**super admin token required**)
- `POST /admins/login` - Login admin

### Menu

- `GET /menus` - Get all menu items
- `GET /menus/:id` - Get menu item by ID
- `POST /menus` - Create menu (**admin/super admin token**, optional image upload)
- `PATCH /menus/:id` - Update menu (**admin/super admin token**, optional image upload)
- `DELETE /menus/:id` - Delete menu (**super admin token required**)

#### Menu payload notes

- `category`: `coffee | milk-tea | desserts | snacks`
- `available`: boolean
- `availabilityTime`:
  - `{ "mode": "anytime" }`
  - `{ "mode": "period", "startTime": "HH:mm", "endTime": "HH:mm" }`
- Response includes computed `isAvailableNow`.

### Payments

- `POST /payments` - Create payment/order (multipart form, requires `paymentImage`)
- `GET /payments/track/:id` - Public order tracking by payment ID
- `GET /payments` - List all payments (**admin/super admin token**)
- `PATCH /payments/:id/status` - Update payment status (**admin/super admin token**)
- `PATCH /payments/:id/confirm` - Confirm payment (**admin/super admin token**)

#### Payment status values

- `received`
- `preparing`
- `ready`
- `completed`

#### Payment method values

- `GCash`
- `Maya`
- `Bank QR`
- `Cash`

### Orders

Orders use the same underlying payment records.

- `GET /orders` - List orders (**admin/super admin token**)
- `PATCH /orders/:id/status` - Update order status (**admin/super admin token**)
- `PATCH /orders/:id/confirm` - Confirm order payment (**admin/super admin token**)

### Analytics

- `GET /analytics/dashboard` - Dashboard stats (**admin/super admin token**)
- `GET /analytics/sales?period=daily|weekly|monthly` - Sales analytics (**admin/super admin token**)
- `GET /analytics/export` - Export analytics report (**admin/super admin token**)

Export query options:

- `format=csv|pdf` (default `csv`)
- `period=weekly|monthly|yearly`
- Custom range: `from=YYYY-MM-DD&to=YYYY-MM-DD`

## File Uploads

Uploaded files are served statically from:

- `/uploads/...`

Storage paths:

- Menu images: `uploads/menu/`
- Payment proofs: `uploads/payments/<YYYY-MM-DD>/`

Accepted upload fields:

- Menu image field: `image`
- Payment proof field: `paymentImage`

## Docker and Cloud Run

This repository includes a Cloud Run-ready `Dockerfile` (multi-stage build).

Deploy source to Cloud Run:

```cmd
gcloud run deploy sugar-api --source . --region asia-southeast1 --platform managed --allow-unauthenticated
```

Set runtime env vars:

```cmd
gcloud run services update sugar-api --region asia-southeast1 --set-env-vars JWT_SECRET=YOUR_JWT_SECRET,MONGO_URI="mongodb+srv://<db_user>:<db_password>@<cluster>.mongodb.net/<db_name>?retryWrites=true&w=majority"
```

## Troubleshooting

- `JWT secret is not configured`
  - Ensure `JWT_SECRET` exists in local `.env` or Cloud Run service env vars.
- Repeated `500` with slow response
  - Usually MongoDB connectivity/whitelist/credential issue.
- `Validation failed`
  - Check payload keys and enum values (status, category, paymentMethod).



## Saturday Meeting