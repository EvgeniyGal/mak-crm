# Specifications

## App Name

**MAK CRM**

## Overview

MAK CRM is a comprehensive system for educational centres, designed to manage Users, Students, Attendances, Student Presences, Teachers, Classes, Schedules, Rooms, Payments, Payment Types, Admin Tasks, Expenditures, and Teacher Salaries.

## Authentication & Authorization

The system includes robust authentication and authorization features:

- **Login Methods**: Supports login via email/password and Google OAuth2 ("Sign in with Google") for enhanced security.
- **Sign Out**: Users can securely sign out from their account at any time.
- **Users Table**: Stores user details with the following fields:
  - `id`
  - `first_name`
  - `last_name`
  - `middle_name`
  - `role` (admin, owner)
  - `phone`
  - `email`
  - `day_of_birth`
  - `status` (approved, pending, fired)
  - `created_at`
  - `updated_at`
- **Sign Up Restrictions**: Only the admin role is available for new user registrations via the sign-up form.
- **New User Status**: When a new user signs up, their status is set to `pending` until approved by an owner.
- **Access Restriction**: Only approved owners and admins can work with the system.
- **Profile Management**: Users can update their own profile information, including name, phone, email, and day of birth, from their account settings.

## Database Table Schemas

**Students**

- `id`
- `student_first_name`
- `student_last_name`
- `student_date_of_birth`
- `parent_first_name`
- `parent_middle_name`
- `phone`
- `email`
- `status` (active, inactive, moved, don't disturb)
- `comment`
- `enrolled_class_ids`
- `interested_class_ids`
- `created_at`
- `updated_at`

**Attendances**

- `id`
- `date`
- `class_id`
- `created_at`
- `updated_at`

**Student_Presences**

- `id`
- `student_id`
- `attendance_id`
- `status` (present, absent, absent with valid reason)
- `comment`
- `created_at`
- `updated_at`

**Teachers**

- `id`
- `first_name`
- `last_name`
- `middle_name`
- `date_of_birth`
- `phone`
- `email`
- `status` (active, probational, fired)
- `comment`
- `assigned_class_ids`
- `created_at`
- `updated_at`

**Classes**

- `id`
- `name`
- `teachers_ids`
- `room_id`
- `schedule_ids`
- `student_ids`
- `status` (active, paused, archive)
- `created_at`
- `updated_at`

**Schedules**

- `id`
- `room_id`
- `time_slot`
- `week_day`
- `created_at`
- `updated_at`

**Rooms**

- `id`
- `name`
- `capacity`
- `created_at`
- `updated_at`

**Payments**

- `id`
- `student_id`
- `class_id`
- `package_type_id`
- `student_presence_ids`
- `status` (paid, pending)
- `type` (cash, card, test)
- `available_lesson_count`
- `created_at`
- `updated_at`

**Package_Types**

- `id`
- `name`
- `amount`
- `lesson_count`
- `class_id`
- `status` (active, archive)
- `created_at`
- `updated_at`

**Admin_Tasks**

- `id`
- `title`
- `type` (first lesson, absent, admin, birthday)
- `comment`
- `status` (active, archive)
- `created_at`
- `updated_at`

**Expenditures**

- `id`
- `type` (regular, staff, till)
- `person`
- `amount`
- `comment`
- `created_at`
- `updated_at`

**Teacher_Salaries**

- `id`
- `teacher`
- `amount`
- `comment`
- `created_at`
- `updated_at`

## Students Dashboard Tab Features

- **Add Student Button**: Opens a modal form to create a new student record. The form must include all required fields from the Students table:
  - `student_first_name`, `student_last_name`, `student_date_of_birth`, `parent_first_name`, `parent_middle_name`, `phone`, `email`, `status`, `comment`, `enrolled_class_ids`, `interested_class_ids`.
- **Enrollment Capacity Enforcement**: When an admin enrolls a student into a class, the system must check for available seats in the selected class based on the assigned room's capacity. If no free seats are available, the UI disables enrollment for that class and displays a "Class full" indicator. Server-side validation also prevents over-enrollment.
- **Student List with Pagination**: Displays a paginated list of students, allowing selection of items per page (10, 20, or 50).
- **Displayed Columns**:
  - Student Full Name (`student_first_name` + `student_last_name`)
  - Age (calculated from `student_date_of_birth`, e.g., "1.7 years")
  - Parent Full Name (`parent_first_name` + `parent_middle_name`)
  - Phone
  - Email
  - Status (active, inactive, moved, don't disturb)
  - Enrolled To Classes (show class names from `enrolled_class_ids`)
  - Interested In Classes (show class names from `interested_class_ids`)
  - Created At (`created_at`)
  - Edit/Delete buttons
- **Search Bar**: Allows searching by Student Full Name, Parent Full Name, Phone, or Email.
- **Filtering Options**:
  - Age range (from `student_date_of_birth`, e.g., "1.7 years" to "2.2 years")
  - Status
  - Enrolled To Classes
  - Interested In Classes
  - Created At (date range)
- **Sorting Options**: Ability to sort by Age, Created At, and Student Full Name.

## Student Absentees Dashboard Tab Features

- **Active Students Only**: Displays only students with status "active" who have been absent from classes.
- **Absence Filter**: Allows filtering students who have not attended any classes within a specified date range (e.g., from 01.09.25 to today).
- **Date Range Selection**: Admins can select a start and end date to view students who have not attended during that period.
- **Displayed Columns**:
  - Student Full Name
  - Age
  - Parent Full Name
  - Phone
  - Email
  - Enrolled Classes
  - Last Attendance Date
  - Total Absences in Selected Range
- **Search Bar**: Search by Student Full Name, Parent Full Name, Phone, or Email.
- **Filtering Options**:
  - Age range
  - Enrolled Classes
  - Last Attendance Date
- **Sorting Options**: Sort by Student Full Name, Age, Last Attendance Date, or Total Absences.

## Student Payments Dashboard Tab Features

- **Active Students Only**: Displays only students with status "active."
- **Payment Data Display**: For each active student, show:
  - Student Full Name
  - Package Type (from `package_type_id`)
  - Number of Lessons in Package (`lesson_count` from Package Type)
  - Number of Available Lessons (`available_lesson_count` from Payments)
  - Payment Type (`type`: cash, card, test; "test" indicates payment for a test lesson) <!-- Updated reference -->
  - Payment Date (`created_at` from Payments)
- **Search Bar**: Allows searching by Student Full Name, Package Type, or Payment Date.
- **Filtering Options**:
  - Package Type
  - Number of Available Lessons
  - Payment Type (cash, card, test) <!-- Updated reference -->
  - Payment Date (date range)
- **Sorting Options**: Ability to sort by Student Name, Package Type, Number of Lessons, Available Lessons, and Payment Date.
- **Payment Management**: Quick actions to create or renew payments for students with low or zero available lessons.
  All features and displayed fields are based on the Students and Payments table schemas and their relationships.

## Attendances Dashboard Tab Features

- **Add Attendance Button**: Opens a modal form to create a new attendance record for a specific date and class. The modal displays a list of students enrolled in the selected class, with checkboxes to mark each student as present, absent, or absent with valid reason. For each student, if they do not have a payment with `available_lesson_count` greater than 1, the admin is prompted in a new modal window to create a payment for that student.
  - When the user submits the modal, the system automatically recalculates the `available_lesson_count` for each student’s payment: decrement by 1 for "present" or "absent" (except "absent with valid reason," which does not affect the count).
- **Attendance List with Pagination**: Displays a paginated list of attendance records, allowing selection of items per page (10, 20, or 50).
- **Displayed Columns**:
  - Date (`date`)
  - Class (show class name from `class_id`)
  - Student Presences (number of present/absent students, with breakdown)
  - Created At (`created_at`)
  - Edit/Delete buttons
- **Search Bar**: Allows searching by Date, Class name, or Student name.
- **Filtering Options**:
  - Date range (from `date`)
  - Class (by `class_id`(class name))
  - Created At (date range)
- **Sorting Options**: Ability to sort by Date, Class name.
- **Student Payment Integration**: When marking attendance, if a student lacks a valid payment (no payment or `available_lesson_count` < 1), admin is prompted to create a payment in a follow-up modal.
- **Automatic Payment Count Adjustment**: When an attendance record is submitted, edited, or deleted, the system recalculates the `available_lesson_count` for each affected student’s payment. Only "absent with valid reason" does not impact the count; "present" and "absent" decrease the count by 1.
  All features and displayed fields are based on the Attendances, Student_Presences, Students, Classes, and Payments table schemas and their relationships.

  ## Class Attendances Dashboard Tab Features

  - **Purpose**: Enables admins to view and analyze group/class attendance for any selected month, broken down by days and by students.
  - **Class Selection**: Admin selects a class from a dropdown list to view its attendance data.
  - **Month Selection**: Admin selects a month and year to display attendance records for that period.
  - **Attendance Table**: Displays a matrix/grid where:
    - Rows represent students enrolled in the selected class.
    - Columns represent each day of the selected month.
    - Each cell shows the attendance status for that student on that day (present, absent, absent with valid reason, or no class scheduled).
    - Optionally, use color coding for quick visual analysis (e.g., green for present, red for absent).
  - **Summary Row/Column**:
    - For each student, show total presents, absences, and absences with valid reason for the selected month.
    - For each day, show total number of students present/absent.
  - **Responsive Design**: Matrix/table adapts for desktop and mobile, with horizontal scrolling for days.
  - **Integration**: Data is based on Attendances, Student_Presences, Students, and Classes table schemas and their relationships.
  - **Use Case**: Supports monthly attendance reporting for each group/class, enabling educational centres to track attendance trends, identify frequently absent students, and generate attendance reports for compliance or internal analysis.

## Teachers Dashboard Tab Features

- **Add Teacher Button**: Opens a modal form to create a new teacher record. The form must include all required fields from the Teachers table:
  - `first_name`, `last_name`, `middle_name`, `date_of_birth`, `phone`, `email`, `status`, `comment`, `assigned_class_ids`.
- **Teacher List with Pagination**: Displays a paginated list of teachers, allowing selection of items per page (10, 20, or 50).
- **Displayed Columns**:
  - Teacher Full Name (`first_name` + `last_name`)
  - Date of Birth (`date_of_birth`)
  - Phone
  - Email
  - Status (active, probational, fired)
  - Assigned Classes (show class names from `assigned_class_ids`)
  - Comment
  - Created At (`created_at`)
  - Edit/Delete buttons
- **Search Bar**: Allows searching by Teacher Full Name, Phone, Email.
- **Filtering Options**:
  - Status
  - Assigned Classes
  - Created At (date range)
- **Sorting Options**: Ability to sort by Teacher Full Name, Date of Birth, Status, and Created At.
- **Class Assignment Management**: Ability to assign or reassign teachers to classes via modal.
- **Archiving**: Ability to archive teacher records (status: fired), with historical data retained.
  All features and displayed fields are based on the Teachers, Classes, and Teacher_Salaries table schemas and their relationships.

## Classes Dashboard Tab Features

- **Add Class Button**: Opens a modal form to create a new class record. The form must include all required fields from the Classes table:
  - `name`, `teachers_ids`, `room_id`, `schedule_ids`, `student_ids`, `status`.
  - When creating or modifying a class in the modal window, the user can also create schedules for this class directly within the same modal.
  - Room capacity / seats: when a `room_id` is selected the modal shows the room's capacity and the class' current enrolled count. Available seats = room.capacity − enrolled students. The modal should prevent adding students beyond available seats.
- **Create Package Type for Class**: Within the class creation/edit modal, users can create and assign Package Types to the class. The modal allows input for package name, amount, lesson count, and status (active, archive). Package Types are linked to the class and available for student enrollment and payment management.
- **Class List with Pagination**: Displays a paginated list of classes, allowing selection of items per page (10, 20, or 50).
- **Displayed Columns**:
  - Class Name (`name`)
  - Assigned Teachers (show teacher names from `teachers_ids`)
  - Room (show room name from `room_id`)
  - Schedule (show time slots and week days from `schedule_ids`)
  - Enrolled Students (show student names from `student_ids`)
  - Available Seats (show as "available / max", derived from room capacity and enrolled count)
  - Status (active, paused, archive)
  - Created At (`created_at`)
  - Edit/Delete buttons
- **Search Bar**: Allows searching by Class Name, Teacher Name.
- **Filtering Options**:
  - Status
  - Assigned Teachers
  - Room
  - Created At (date range)
- **Class Assignment Management**: Ability to assign or reassign teachers, students, rooms, and schedules via modal. Enrollment operations must enforce capacity rules:
  - Client-side UI should disable "Add Student" when available seats = 0 and show a clear "Class full" indicator.
  - Server-side validation must also prevent over-enrollment.
- **Archiving**: Ability to archive class records (status: archive), with historical attendance and enrollment data retained.
- **Schedule Integration**: View and manage class schedules, including weekly calendar view and conflict detection for rooms/teachers. When changing a class' room or schedule, recalculate available seats (if capacity changes) and alert if enrolled count exceeds capacity; provide reconciliation tools (move students, increase room, or enable temporary overbook with admin confirmation).
- **Enrollment Management**: Add or remove students from classes, with automatic updates to related attendance and payment records. Enrollment actions must:
  - Check available seats before adding a student (derived from the selected room's capacity).
  - Prevent adding when no seats are available (UI-disabled + server validation).
  - Free up seats when a student is removed.
  - Recalculate available seats automatically when room capacity or enrolled students change.
    All features and displayed fields are based on the Classes, Teachers, Students, Schedules, Rooms, and Package_Types table schemas and their relationships.

## Schedules Dashboard Tab Features

- **Add Schedule Button**: Opens a modal form to create a new schedule record. The form must include all required fields from the Schedules table and must always bind the schedule to a class:
  - `class_id` (required: select the class to bind the schedule)
  - `room_id`
  - `time_slot`
  - `week_day`
- **Weekly Calendar View**: Provides a visual, interactive calendar displaying all scheduled classes across the week. Each class is shown in its assigned time slot, with teacher and room details. Users can drag-and-drop to reschedule classes, and click on any scheduled class to open a modal for viewing or editing its details.
- **Conflict Detection**: Automatically highlights scheduling conflicts (e.g., overlapping classes in the same room or with the same teacher) and prompts the user to resolve them before saving changes.
- **Schedule List with Pagination**: Displays a paginated list of schedules, allowing selection of items per page (10, 20, or 50).
- **Displayed Columns**:
  - Room (show room name from `room_id`)
  - Class (show class name from `class_id`)
  - Teacher(s) (show teacher names assigned to the class)
  - Time Slot (`time_slot`)
  - Week Day (`week_day`)
  - Created At (`created_at`)
  - Edit/Delete buttons
- **Filtering Options**:
  - Room
  - Class
  - Teacher
  - Created At (date range)
- **Sorting Options**: Ability to sort by Room, Class, Teacher, Week Day, and Time Slot.
- **Responsive Design**: Weekly calendar and schedule list adapt for desktop and mobile, ensuring usability on all devices.
  All features and displayed fields are based on the Schedules, Classes, Rooms, and Teachers table schemas and their relationships. Every schedule must be linked to a class.

## Rooms Dashboard Tab Features

- **Add Room Button**: Opens a modal form to create a new room record. The form must include all required fields from the Rooms table:
  - `name`, `capacity`.
- **Room List with Pagination**: Displays a paginated list of rooms, allowing selection of items per page (10, 20, or 50).
- **Displayed Columns**:
  - Room Name (`name`)
  - Capacity (`capacity`)
  - Assigned Classes (show class names currently scheduled in the room)
  - Created At (`created_at`)
  - Edit/Delete buttons
- **Capacity Enforcement**: When assigning classes to rooms, the system must enforce room capacity limits. UI should display current occupancy and prevent overbooking.
- **Archiving**: Ability to archive room records, retaining historical schedule and assignment data.
  All features and displayed fields are based on the Rooms, Classes, and Schedules table schemas and their relationships.

## Payments Dashboard Tab Features

- **Add Payment Button**: Opens a modal form to create a new payment record for a student and class. The form must include all required fields from the Payments table:
  - `student_id`, `class_id`, `package_type_id`, `student_presence_ids`, `status`, `type`, `available_lesson_count`.
- **Payment List with Pagination**: Displays a paginated list of payments, allowing selection of items per page (10, 20, or 50).
- **Displayed Columns**:
  - Student Name (from `student_id`)
  - Class Name (from `class_id`)
  - Package Type (from `package_type_id`)
  - Payment Status (`status`: paid, pending)
  - Payment Type (`type`: cash, card, test; "test" indicates payment for a test lesson)
  - Available Lessons (`available_lesson_count`)
  - Linked Attendances (from `student_presence_ids`)
  - Amount (from Package Type)
  - Created At (`created_at`)
  - Edit/Delete buttons
- **Search Bar**: Allows searching by Student Name, Class Name, Payment Type (including "test" for test lesson payments).

- **Filtering Options**:
  - Payment Status (paid, pending)
  - Payment Type (cash, card, test)
  - Class
  - Student
  - Date range (Created At)
  - Package Type
- **Automatic Lesson Count Adjustment**: When attendance is marked, the system automatically decrements `available_lesson_count` for the corresponding payment, except for "absent with valid reason."
- **Payment Reminders**: Highlight students with pending payments or low available lesson count, and provide quick actions to create or renew payments.
- **Payment History**: View historical payment records per student, including previous packages and usage.
- **Integration with Attendance**: Payments are linked to attendance records; when a payment is created or updated, related attendances are automatically associated.

## Admin Tasks Dashboard Tab Features

- **Add Admin Task Button**: Opens a modal form to create a new admin task record. The form must include all required fields from the Admin_Tasks table:
  - `title`, `type` (first lesson, absent, admin, birthday), `comment`, `status` (active, archive).
- **Admin Task List with Pagination**: Displays a paginated list of admin tasks, allowing selection of items per page (10, 20, or 50).
- **Displayed Columns**:
  - Title
  - Type (first lesson, absent, admin, birthday)
  - Comment
  - Status (active, archive)
  - Created At (`created_at`)
  - Edit/Delete buttons
- **Search Bar**: Allows searching by Title or Comment.
- **Filtering Options**:
  - Type
  - Status
  - Created At (date range)
- **Task Status Management**: Mark tasks as active or archive. Archived tasks retain historical data for reporting.
- **Commenting & Updates**: Allow admins to add comments or update task details directly from the dashboard.
  All features and displayed fields are based on the Admin_Tasks table schema and its relationships.

## Expenditures Dashboard Tab Features

- **Add Expenditure Button**: Opens a modal form to create a new expenditure record. The form must include all required fields from the Expenditures table:
  - `type` (regular, staff, till), `person`, `amount`, `comment`.
- **Expenditure List with Pagination**: Displays a paginated list of expenditures, allowing selection of items per page (10, 20, or 50).
- **Displayed Columns**:
  - Type
  - Person
  - Amount
  - Comment
  - Created At (`created_at`)
  - Edit/Delete buttons
- **Search Bar**: Allows searching by Person or Comment.
- **Filtering Options**:
  - Type (regular, staff, till)
  - Person
  - Date range (Created At)
    All features and displayed fields are based on the Expenditures table schema and its relationships.

## Teacher Salaries Dashboard Tab Features

- **Add Salary Record Button**: Opens a modal form to create a new teacher salary record. The form must include all required fields from the Teacher_Salaries table:
  - `teacher`, `amount`, `comment`.
- **Salary List with Pagination**: Displays a paginated list of teacher salary records, allowing selection of items per page (10, 20, or 50).
- **Displayed Columns**:
  - Teacher Name (from `teacher`)
  - Amount (`amount`)
  - Comment (`comment`)
  - Created At (`created_at`)
  - Edit/Delete buttons
- **Search Bar**: Allows searching by Teacher Name or Comment.
- **Filtering Options**:

  - Teacher
  - Date range (Created At)

  ## Home Dashboard Tab Features

  The home dashboard provides quick access to essential operational insights and actions, divided into five main areas. All calculations for these areas are performed server-side daily at 7 a.m., and resulting tasks are automatically added to the Admin_Tasks table. Users can archive tasks, which requires entering a remark in the Admin_Tasks table.

  ### Area 1: First Lesson

  - **List Description**: Shows students who attended a lesson for the first time in the current week (identified by Payments with `type` set to `test`).
  - If a student does not attend their scheduled first lesson, a task is created for the admin to follow up, determine the reason, and find out when the student will attend.
  - All calculations are performed server-side daily at 7 a.m., and resulting tasks are automatically added to the Admin_Tasks table.

  ### Area 2: Absent Students

  - **List Description**: Displays students who have been absent for three consecutive lessons.
  - A task is created prompting the admin to call and investigate the reason for repeated absences.
    - All calculations are performed server-side daily at 7 a.m., and resulting tasks are automatically added to the Admin_Tasks table.

  ### Area 3: Birthdays

  - **List Description**: Lists students with birthdays in the current week and teachers with birthdays in the upcoming week.
  - Tasks are created to remind the admin to congratulate students and teachers on their birthdays.
    - All calculations are performed server-side daily at 7 a.m., and resulting tasks are automatically added to the Admin_Tasks table.

  ### Area 4: Finance

  - **List Description**: Displays financial summaries for the day, week, and month.
  - Shows total payments received, total expenditures, total teacher salaries paid, and current money in till for each period.
  - Enables admins to quickly review financial health and identify anomalies.
  - Tasks are generated for unusual financial activity or when expenditures exceed payments.

  ### Area 5: Admin Tasks

  - **List Description**: Shows all active admin tasks, including those generated by the system and manually added by users.
  - Users can send tasks to archive, which requires entering a remark in the Admin_Tasks table for tracking and reporting.
    All features ensure timely notifications and proactive management of key events, with server-side logic handling calculations and task generation.
  - Notifies the admin about new tasks.
  - Sends notifications to both the admin and designated users (e.g., "me" and "Tanya") when a task is completed.
  - Allows adding comments to tasks for better collaboration and tracking.

  All features are designed to streamline daily operations, improve communication, and ensure timely follow-ups for key events and tasks.

  ## Users Dashboard Tab Features

  - **Visibility**: This tab is only visible and accessible to users with the "owner" role.
  - **User Management**: Owners can view and manage all users in the system, including those with "approved," "pending," or "fired" status.
  - **User List with Pagination**: Displays a paginated list of users, allowing selection of items per page (10, 20, or 50).
  - **Displayed Columns**:
    - Full Name (`first_name` + `last_name`)
    - Role (`role`)
    - Phone
    - Email
    - Status (`approved`, `pending`, `fired`)
    - Created At (`created_at`)
    - Edit/Delete buttons
  - **Search Bar**: Allows searching by Full Name, Phone, or Email.
  - **Filtering Options**:
    - Role
    - Status
    - Created At (date range)
  - **Sorting Options**: Ability to sort by Full Name, Role, Status, and Created At.
  - **Status Management**: Owners can approve pending users, archive (fire) users, or update user details. Archiving a user sets their status to "fired" and retains historical data.

  All features and displayed fields are based on the Users table schema and its relationships.

  ## Analytics Dashboard Tab Features

  - **Access Restriction**: Only users with the "owner" role can view and access the Analytics dashboard tab.
  - **Purpose**: Provides comprehensive visibility into key performance indicators (KPIs) and trends across all operational areas of the CRM.
  - **KPI Overview**: Displays high-level metrics such as:
    - Total active students
    - New student enrollments (weekly/monthly)
    - Attendance rates (overall and per class)
    - Payment completion rates
    - Teacher performance metrics (e.g., average attendance per teacher)
    - Financial summaries (payments received, expenditures, salaries)
  - **Charts & Visualizations**:
    - Line charts for student enrollment trends over time
    - Bar charts for class attendance rates
    - Pie charts for payment types and statuses
    - Stacked bar charts for financial breakdowns (payments, expenditures, salaries)
    - Heatmaps for attendance by day/week/month
  - **Filtering & Drilldown**:
    - Filter KPIs and charts by date range, class, teacher, payment type, and status
    - Drill down into specific metrics for detailed analysis (e.g., view attendance trends for a selected class or teacher)
  - **Export & Reporting**:
    - Export charts and KPI data to PDF or Excel for reporting purposes
    - Generate summary reports for selected periods and categories
  - **Responsive Design**: All charts and analytics views are fully responsive for desktop and mobile devices.
  - **Data Source**: All analytics are calculated server-side using data from Students, Attendances, Payments, Teachers, Classes, Expenditures, and related tables.

  All features are designed to empower owners with actionable insights, support strategic decision-making, and enable data-driven management of the educational centre.

## UI/UX Requirements

- The interface must be modern, visually appealing, and adhere to dashboard best practices: clear visual hierarchy, intuitive filtering, and consistent layouts across all views.
- The system must support multilingual UI (English and Ukrainian), with Ukrainian set as the default language and a language switcher available.
- All screens and components must be fully responsive, ensuring optimal usability and readability on both desktop and mobile devices.
- The CRM is designed to provide educational centres with comprehensive visibility and control over student onboarding, attendance tracking, course management, teacher records, and financial operations.
  - Administrative workflows should be proactive, leveraging notifications, advanced filtering, and reporting tools to surface actionable insights (e.g., new student enrollments per course in the last month), enabling data-driven decision making and supporting organizational growth.
