# MAK CRM

Comprehensive CRM system for educational centres, designed to manage Students, Teachers, Classes, Schedules, Rooms, Payments, Attendances, Admin Tasks, Expenditures, and Teacher Salaries.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Custom components built with Tailwind
- **Backend**: Supabase (PostgreSQL database, Authentication, Real-time)
- **Authentication**: Supabase Auth with email/password and Google OAuth
- **Charts**: Recharts
- **Internationalization**: react-i18next (English/Ukrainian support)

## Features

### Authentication & Authorization
- Email/password login
- Google OAuth2 sign-in
- Role-based access (admin, owner)
- User approval workflow (pending → approved)
- Profile management

### Student Management
- Complete student CRUD operations
- Capacity enforcement for class enrollment
- Student status tracking (active, inactive, moved, don't disturb)
- Age calculation and display
- Search and filtering (by name, parent, phone, email, status, classes)
- Pagination (10, 20, 50 items per page)

### Attendance Management
- Create attendance records for classes
- Mark student presence (present, absent, absent with valid reason)
- Automatic payment lesson count decrement
- Payment validation before attendance
- Attendance statistics and summaries
- Monthly attendance matrix view per class

### Payment System
- Payment records with package types
- Automatic lesson count management
- Payment status tracking (paid, pending)
- Payment types (cash, card, test)
- Available lesson count tracking
- Integration with attendance system

### Class Management
- Class CRUD operations
- Teacher assignment
- Student enrollment with capacity checking
- Room assignment
- Package type creation within class modal
- Schedule integration
- Capacity enforcement based on room size

### Teacher Management
- Teacher CRUD operations
- Class assignment
- Status tracking (active, probational, fired)
- Teacher information management

### Schedule Management
- Weekly calendar view
- List view
- Schedule creation with conflict detection
- Room and teacher conflict checking
- Time slot management

### Room Management
- Room CRUD operations
- Capacity tracking
- Class assignment display

### Financial Management
- Payments tracking
- Expenditures (regular, staff, till)
- Teacher salaries
- Financial summaries (day, week, month)
- Financial anomaly detection

### Admin Tasks
- Manual task creation
- Automated task generation (daily at 7 AM):
  - First lesson follow-ups
  - Absent student notifications (3 consecutive absences)
  - Birthday reminders (students this week, teachers next week)
  - Financial anomaly alerts
- Task archiving with comments
- Task filtering and search

### Analytics (Owner-only)
- KPI dashboard
- Enrollment trends
- Attendance rates by class
- Payment type breakdowns
- Financial summaries
- Interactive charts

### User Management (Owner-only)
- View all users
- Approve pending users
- Archive/fire users
- Edit user details
- Role management

## Database Schema

The system uses PostgreSQL with the following main tables:
- `users` - System users (admins, owners)
- `students` - Student records
- `teachers` - Teacher records
- `classes` - Class/course records
- `rooms` - Room/space records
- `schedules` - Class schedules
- `attendances` - Attendance records
- `student_presences` - Individual student attendance
- `payments` - Payment records
- `package_types` - Payment package definitions
- `admin_tasks` - Administrative tasks
- `expenditures` - Expense records
- `teacher_salaries` - Salary payment records

## Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Set up Supabase**:
   - Create a Supabase project
   - Run migrations from `supabase/migrations/`
   - Configure environment variables

3. **Environment variables**:
Create a `.env.local` file:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. **Run the development server**:
```bash
npm run dev
```

5. **Database Functions**:
   - The automated task generation functions are in `002_automated_tasks.sql`
   - To schedule daily execution at 7 AM, use pg_cron extension or external cron:
     ```sql
     SELECT cron.schedule('daily-task-generation', '0 7 * * *', $$SELECT generate_daily_tasks()$$);
     ```

## Deployment

The application is designed to be deployed on Vercel with Supabase as the backend.

## Internationalization

The system supports Ukrainian (default) and English languages. Language switcher available in the UI.

## Security

- Row Level Security (RLS) enabled on all tables
- Only approved users can access the system
- Owner-only pages (Users, Analytics) are protected
- Authentication required for all dashboard routes

## License
MIT


Private project for educational centres.
