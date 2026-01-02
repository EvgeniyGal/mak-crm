-- ===============================
-- Automated Task Generation Functions
-- ===============================

-- Function to check for first lesson attendance issues
CREATE OR REPLACE FUNCTION check_first_lessons()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    payment_record RECORD;
    attendance_exists BOOLEAN;
BEGIN
    -- Find payments with type 'test' from current week
    FOR payment_record IN
        SELECT p.id, p.student_id, p.created_at, p.class_id
        FROM payments p
        WHERE p.type = 'test'
          AND p.created_at >= date_trunc('week', CURRENT_DATE)
          AND p.created_at < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week'
    LOOP
        -- Check if attendance exists for this student in this class after payment
        SELECT EXISTS (
            SELECT 1
            FROM attendances a
            JOIN student_presences sp ON sp.attendance_id = a.id
            WHERE a.class_id = payment_record.class_id
              AND sp.student_id = payment_record.student_id
              AND a.date >= payment_record.created_at::date
        )
        INTO attendance_exists;

        -- If no attendance, create task if not exists
        IF NOT attendance_exists THEN
            INSERT INTO admin_tasks (title, type, comment, status)
            SELECT
                'Студент має перший урок, але не відвідав заняття',
                'first lesson',
                'Перевірте, чому студент не відвідав перший урок та коли він планує відвідати.',
                'active'
            WHERE NOT EXISTS (
                SELECT 1
                FROM admin_tasks
                WHERE type = 'first lesson'
                  AND status = 'active'
                  AND created_at >= CURRENT_DATE - INTERVAL '1 day'
            );
        END IF;
    END LOOP;
END;
$$;

-- ===============================
-- Function to check for students with 3 absences
-- ===============================
CREATE OR REPLACE FUNCTION check_absent_students()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    student_record RECORD;
    absences_count INTEGER;
BEGIN
    -- Find active students
    FOR student_record IN
        SELECT s.id, s.student_first_name, s.student_last_name, s.enrolled_class_ids
        FROM students s
        WHERE s.status = 'active'
          AND array_length(s.enrolled_class_ids, 1) > 0
    LOOP
        -- Count absences in last 30 days
        SELECT COUNT(*)
        INTO absences_count
        FROM attendances a
        JOIN student_presences sp ON sp.attendance_id = a.id
        WHERE a.class_id = ANY(student_record.enrolled_class_ids)
          AND sp.student_id = student_record.id
          AND sp.status = 'absent'
          AND a.date >= CURRENT_DATE - INTERVAL '30 days';

        -- If 3 or more absences, create task
        IF absences_count >= 3 THEN
            INSERT INTO admin_tasks (title, type, comment, status)
            SELECT
                'Студент пропустив 3 заняття',
                'absent',
                'Потрібно подзвонити батькам студента ' ||
                student_record.student_first_name || ' ' ||
                student_record.student_last_name ||
                ' та з''ясувати причину пропусків.',
                'active'
            WHERE NOT EXISTS (
                SELECT 1
                FROM admin_tasks
                WHERE type = 'absent'
                  AND status = 'active'
                  AND created_at >= CURRENT_DATE - INTERVAL '1 day'
            );
        END IF;
    END LOOP;
END;
$$;

-- ===============================
-- Function to check for birthdays
-- ===============================
CREATE OR REPLACE FUNCTION check_birthdays()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    person_record RECORD;
    current_week_start DATE;
    current_week_end DATE;
    next_week_start DATE;
    next_week_end DATE;
    birthday_this_year DATE;
BEGIN
    current_week_start := date_trunc('week', CURRENT_DATE)::date;
    current_week_end   := current_week_start + INTERVAL '6 days';
    next_week_start    := current_week_end + INTERVAL '1 day';
    next_week_end      := next_week_start + INTERVAL '6 days';

    -- Students birthdays this week
    FOR person_record IN
        SELECT student_first_name, student_last_name, student_date_of_birth
        FROM students
        WHERE status = 'active'
          AND student_date_of_birth IS NOT NULL
    LOOP
        birthday_this_year :=
            make_date(
                EXTRACT(YEAR FROM CURRENT_DATE)::int,
                EXTRACT(MONTH FROM person_record.student_date_of_birth)::int,
                EXTRACT(DAY FROM person_record.student_date_of_birth)::int
            );

        IF birthday_this_year BETWEEN current_week_start AND current_week_end THEN
            INSERT INTO admin_tasks (title, type, comment, status)
            SELECT
                'День народження студента',
                'birthday',
                'Вітайте студента ' ||
                person_record.student_first_name || ' ' ||
                person_record.student_last_name || ' з днем народження!',
                'active'
            WHERE NOT EXISTS (
                SELECT 1
                FROM admin_tasks
                WHERE type = 'birthday'
                  AND status = 'active'
                  AND created_at >= current_week_start
            );
        END IF;
    END LOOP;

    -- Teachers birthdays next week
    FOR person_record IN
        SELECT first_name, last_name, date_of_birth
        FROM teachers
        WHERE status = 'active'
          AND date_of_birth IS NOT NULL
    LOOP
        birthday_this_year :=
            make_date(
                EXTRACT(YEAR FROM CURRENT_DATE)::int,
                EXTRACT(MONTH FROM person_record.date_of_birth)::int,
                EXTRACT(DAY FROM person_record.date_of_birth)::int
            );

        IF birthday_this_year BETWEEN next_week_start AND next_week_end THEN
            INSERT INTO admin_tasks (title, type, comment, status)
            SELECT
                'День народження вчителя (наступного тижня)',
                'birthday',
                'Підготуйтеся до дня народження вчителя ' ||
                person_record.first_name || ' ' ||
                person_record.last_name || ' наступного тижня.',
                'active'
            WHERE NOT EXISTS (
                SELECT 1
                FROM admin_tasks
                WHERE type = 'birthday'
                  AND status = 'active'
                  AND created_at >= current_week_start
            );
        END IF;
    END LOOP;
END;
$$;

-- ===============================
-- Function to check financial anomalies
-- ===============================
CREATE OR REPLACE FUNCTION check_financial_anomalies()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    today_payments NUMERIC;
    today_expenditures NUMERIC;
    today_salaries NUMERIC;
    week_payments NUMERIC;
    week_expenditures NUMERIC;
    week_salaries NUMERIC;
BEGIN
    SELECT COALESCE(SUM(pt.amount), 0)
    INTO today_payments
    FROM payments p
    JOIN package_types pt ON pt.id = p.package_type_id
    WHERE p.status = 'paid'
      AND p.created_at::date = CURRENT_DATE;

    SELECT COALESCE(SUM(amount), 0)
    INTO today_expenditures
    FROM expenditures
    WHERE created_at::date = CURRENT_DATE;

    SELECT COALESCE(SUM(amount), 0)
    INTO today_salaries
    FROM teacher_salaries
    WHERE created_at::date = CURRENT_DATE;

    SELECT COALESCE(SUM(pt.amount), 0)
    INTO week_payments
    FROM payments p
    JOIN package_types pt ON pt.id = p.package_type_id
    WHERE p.status = 'paid'
      AND p.created_at >= date_trunc('week', CURRENT_DATE);

    SELECT COALESCE(SUM(amount), 0)
    INTO week_expenditures
    FROM expenditures
    WHERE created_at >= date_trunc('week', CURRENT_DATE);

    SELECT COALESCE(SUM(amount), 0)
    INTO week_salaries
    FROM teacher_salaries
    WHERE created_at >= date_trunc('week', CURRENT_DATE);

    IF (today_expenditures + today_salaries) > today_payments AND today_payments > 0 THEN
        INSERT INTO admin_tasks (title, type, comment, status)
        SELECT
            'Перевитрати за сьогодні',
            'admin',
            'Сьогодні витрати перевищують платежі.',
            'active'
        WHERE NOT EXISTS (
            SELECT 1
            FROM admin_tasks
            WHERE title = 'Перевитрати за сьогодні'
              AND created_at::date = CURRENT_DATE
        );
    END IF;

    IF (week_expenditures + week_salaries) > week_payments AND week_payments > 0 THEN
        INSERT INTO admin_tasks (title, type, comment, status)
        SELECT
            'Перевитрати за тиждень',
            'admin',
            'За цей тиждень витрати перевищують платежі.',
            'active'
        WHERE NOT EXISTS (
            SELECT 1
            FROM admin_tasks
            WHERE title = 'Перевитрати за тиждень'
              AND created_at >= date_trunc('week', CURRENT_DATE)
        );
    END IF;
END;
$$;

-- ===============================
-- Main daily task generator
-- ===============================
CREATE OR REPLACE FUNCTION generate_daily_tasks()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    PERFORM check_first_lessons();
    PERFORM check_absent_students();
    PERFORM check_birthdays();
    PERFORM check_financial_anomalies();
END;
$$;

-- ===============================
-- Optional: pg_cron example
-- ===============================
-- SELECT cron.schedule(
--   'daily-task-generation',
--   '0 7 * * *',
--   $$SELECT generate_daily_tasks();$$
-- );
