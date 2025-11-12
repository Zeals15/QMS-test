# Prayosha Server (minimal scaffold)

This is a minimal Express server scaffold to demonstrate connecting the React frontend to a MySQL backend.

Setup
1. cd server
2. npm install
3. Set environment variables (optional):
   - MYSQL_HOST
   - MYSQL_USER
   - MYSQL_PASSWORD
   - MYSQL_DATABASE
4. npm start

Endpoints
- GET /api/health - simple health check
- GET /api/stats - returns simple stats (reads from `quotations` table if DB is available)
- POST /api/quotations - placeholder to create a quotation

Notes
- This is a scaffold. For production use, add proper validation, authentication, error handling, and migrations.
