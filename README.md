# Sugar API

Backend API for the Sugar project, deployed on Google Cloud Run.

## Prerequisites

- Node.js 20+
- npm
- Google Cloud SDK (`gcloud`)
- MongoDB Atlas cluster and database user
- Google Cloud project with billing enabled

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env` in the project root:

```env
PORT=3000
JWT_SECRET=your_jwt_secret_here
MONGO_URI=mongodb+srv://<db_user>:<db_password>@<cluster>.mongodb.net/<db_name>?retryWrites=true&w=majority
```

Important:
- Always include `<db_name>` in `MONGO_URI`.
- In Cloud Run, you should not set `PORT` manually.

Run locally:

```bash
npm run start
```

Health check:

```http
GET http://localhost:3000/
```

## Docker (Cloud Run Ready)

This repo uses a multi-stage `Dockerfile`:
- Builder stage compiles TypeScript to `dist/`
- Runtime stage installs production dependencies only
- Service starts with `node dist/server.js`

## Google Cloud Run Deployment

The app is deployed to `asia-southeast1`.

### 1) Set project and enable required APIs

```cmd
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

### 2) (If needed) grant build/deploy IAM roles

If you get `PERMISSION_DENIED` during `gcloud run deploy --source`, grant roles to the default compute service account:

```cmd
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/run.builder"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/artifactregistry.writer"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/logging.logWriter"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/storage.objectAdmin"
gcloud iam service-accounts add-iam-policy-binding YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com --member="user:YOUR_GCP_EMAIL" --role="roles/iam.serviceAccountUser"
```

### 3) Set Cloud Run environment variables

Set runtime secrets/config on the service:

```cmd
gcloud run services update sugar-api --region asia-southeast1 --set-env-vars JWT_SECRET=YOUR_JWT_SECRET,MONGO_URI="mongodb+srv://<db_user>:<db_password>@<cluster>.mongodb.net/<db_name>?retryWrites=true&w=majority"
```

### 4) Deploy

Windows CMD single-line command:

```cmd
gcloud run deploy sugar-api --source . --region asia-southeast1 --platform managed --allow-unauthenticated
```

## Post-Deploy Verification

Get service URL:

```cmd
gcloud run services describe sugar-api --region asia-southeast1 --format="value(status.url)"
```

Check current env vars on the latest revision:

```cmd
gcloud run services describe sugar-api --region asia-southeast1 --format="yaml(spec.template.spec.containers[0].env)"
```

Read logs:

```cmd
gcloud run services logs read sugar-api --region asia-southeast1 --limit=200
```

## MongoDB Atlas Notes

If endpoints return `500` after about 10 seconds, it is usually a DB connectivity issue.

Verify:
- Atlas network access allows your Cloud Run egress
- Atlas DB user has `readWrite` on the target DB
- `MONGO_URI` includes a DB name and valid credentials

## Common Errors

- `JWT secret is not configured`
  - `JWT_SECRET` is missing in Cloud Run env vars.
- `Failed to create admin`
  - Usually Mongo connectivity/permissions/URI issue.
- `unrecognized arguments: \` on Windows CMD
  - Use one-line commands or `^` continuation in CMD.
