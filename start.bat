@echo off

start "Frontend" cmd /k cd frontend ^&^& npm run dev
start "Backend" cmd /k python -m uvicorn app.backend:app --reload