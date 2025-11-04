-- Automated Task Generation Functions
-- These functions generate admin tasks automatically based on system events

-- Function to check for first lesson attendance issues
CREATE OR REPLACE FUNCTION check_first_lessons()
RETURNS void AS $$
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
        SELECT EXISTS(
            SELECT 1
            FROM attendances a
            JOIN student_presences sp ON sp.attendance_id = a.id
            WHERE a.class_id = payment_record.class_id
            AND sp.student_id = payment_record.student_id
            AND a.date >= payment_record.created_at::date
        ) INTO attendance_exists;

        -- If no attendance, create task if not exists
        IF NOT attendance_exists THEN
            INSERT INTO admin_tasks (title, type, comment, status)
            SELECT 
                'Студент має перший урок, але не відвідав заняття',
                'first lesson',
                'Перевірте, чому студент не відвідав перший урок та коли він планує відвідати.',
                'active'
            WHERE NOT EXISTS (
                SELECT 1 FROM admin_tasks
                WHERE type = 'first lesson'
                AND status = 'active'
                AND comment LIKE '%' || (SELECT student_first_name || ' ' || student_last_name FROM students WHERE id = payment_record.student_id) || '%'
                AND created_at >= CURRENT_DATE - INTERVAL '1 day'
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to check for students with 3 consecutive absences
CREATE OR REPLACE FUNCTION check_absent_students()
RETURNS void AS $$
DECLARE
    student_record RECORD;
    absences_count INTEGER;
    last_presence_date DATE;
BEGIN
    -- Find active students
    FOR student_record IN
        SELECT s.id, s.student_first_name, s.student_last_name, s.enrolled_class_ids
        FROM students s
        WHERE s.status = 'active'
        AND array_length(s.enrolled_class_ids, 1) > 0
    LOOP
        -- Check last 3 attendances for enrolled classes
        SELECT COUNT(*), MAX(a.date)
        INTO absences_count, last_presence_date
        FROM attendances a
        JOIN student_presences sp ON sp.attendance_id = a.id
        WHERE a.class_id = ANY(student_record.enrolled_class_ids)
        AND sp.student_id = student_record.id
        AND sp.status IN ('absent')
        AND a.date >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY a.date DESC
        LIMIT 3;

        -- If 3 consecutive absences, create task
        IF absences_count >= 3 THEN
            INSERT INTO admin_tasks (title, type, comment, status)
            SELECT 
                'Студент пропустив 3 послідовних заняття',
                'absent',
                'Потрібно подзвонити батькам студента ' || 
                student_record.student_first_name || ' ' || student_record.student_last_name ||
                ' та з''ясонувати причину пропусків.',
                'active'
            WHERE NOT EXISTS (
                SELECT 1 FROM admin_tasks
                WHERE type = 'absent'
                AND status = 'active'
                AND comment LIKE '%' || student_record.student_first_name || '%' || student_record.student_last_name || '%'
                AND created_at >= CURRENT_DATE - INTERVAL '1 day'
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to check for birthdays
CREATE OR REPLACE FUNCTION check_birthdays()
RETURNS void AS $$
DECLARE
    person_record RECORD;
    current_week_start DATE;
    current_week_end DATE;
    next_week_start DATE;
    next_week_end DATE;
    birthday_date DATE;
    birthday_this_year DATE;
BEGIN
    current_week_start := date_trunc('week', CURRENT_DATE);
    current_week_end := current_week_start + INTERVAL '6 days';
    next_week_start := current_week_end + INTERVAL '1 day';
    next_week_end := next_week_start + INTERVAL '6 days';

    -- Check students with birthdays in current week
    FOR person_record IN
        SELECT id, student_first_name, student_last_name, student_date_of_birth
        FROM students
        WHERE status = 'active'
        AND student_date_of_birth IS NOT NULL
    LOOP
        birthday_date := person_record.student_date_of_birth;
        birthday_this_year := date_trunc('year', CURRENT_DATE)::date + 
                            (birthday_date - date_trunc('year', birthday_date)::date);

        IF birthday_this_year >= current_week_start AND birthday_this_year <= current_week_end THEN
            INSERT INTO admin_tasks (title, type, comment, status)
            SELECT 
                'День народження студента',
                'birthday',
                'Вітайте студента ' || person_record.student_first_name || ' ' || 
                person_record.student_last_name || ' з днем народження!',
                'active'
            WHERE NOT EXISTS (
                SELECT 1 FROM admin_tasks
                WHERE type = 'birthday'
                AND status = 'active'
                AND comment LIKE '%' || person_record.student_first_name || '%' || person_record.student_last_name || '%'
                AND created_at >= current_week_start
            );
        END IF;
    END LOOP;

    -- Check teachers with birthdays in next week
    FOR person_record IN
        SELECT id, first_name, last_name, date_of_birth
        FROM teachers
        WHERE status = 'active'
        AND date_of_birth IS NOT NULL
    LOOP
        birthday_date := person_record.date_of_birth;
        birthday_this_year := date_trunc('year', CURRENT_DATE)::date + 
                            (birthday_date - date_trunc('year', birthday_date)::date);

        IF birthday_this_year >= next_week_start AND birthday_this_year <= next_week_end THEN
            INSERT INTO admin_tasks (title, type, comment, status)
            SELECT 
                'День народження вчителя (наступного тижня)',
                'birthday',
                'Підготуйтеся до дня народження вчителя ' || 
                person_record.first_name || ' ' || person_record.last_name || ' наступного тижня.',
                'active'
            WHERE NOT EXISTS (
                SELECT 1 FROM admin_tasks
                WHERE type = 'birthday'
                AND status = 'active'
                AND comment LIKE '%' || person_record.first_name || '%' || person_record.last_name || '%'
                AND created_at >= current_week_start
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to check financial anomalies
CREATE OR REPLACE FUNCTION check_financial_anomalies()
RETURNS void AS $$
DECLARE
    today_payments DECIMAL;
    today_expenditures DECIMAL;
    today_salaries DECIMAL;
    week_payments DECIMAL;
    week_expenditures DECIMAL;
    week_salaries DECIMAL;
BEGIN
    -- Calculate today's finances
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

    -- Calculate week's finances
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

    -- Create task if expenditures exceed payments
    IF (today_expenditures + today_salaries) > today_payments AND today_payments > 0 THEN
        INSERT INTO admin_tasks (title, type, comment, status)
        SELECT 
            'Перевитрати за сьогодні',
            'admin',
            'Сьогодні витрати (' || (today_expenditures + today_salaries) || ' грн) перевищують платежі (' || today_payments || ' грн).',
            'active'
        WHERE NOT EXISTS (
            SELECT 1 FROM admin_tasks
            WHERE type = 'admin'
            AND status = 'active'
            AND title = 'Перевитрати за сьогодні'
            AND created_at::date = CURRENT_DATE
        );
    END IF;

    IF (week_expenditures + week_salaries) > week_payments AND week_payments > 0 THEN
        INSERT INTO admin_tasks (title, type, comment, status)
        SELECT 
            'Перевитрати за тиждень',
            'admin',
            'За цей тиждень витрати (' || (week_expenditures + week_salaries) || ' грн) перевищують платежі (' || week_payments || ' грн).',
            'active'
        WHERE NOT EXISTS (
            SELECT 1 FROM admin_tasks
            WHERE type = 'admin'
            AND status = 'active'
            AND title = 'Перевитрати за тиждень'
            AND created_at >= date_trunc('week', CURRENT_DATE)
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Main function to run all checks (should be called daily at 7 AM)
CREATE OR REPLACE FUNCTION generate_daily_tasks()
RETURNS void AS $$
BEGIN
    PERFORM check_first_lessons();
    PERFORM check_absent_students();
    PERFORM check_birthdays();
    PERFORM check_financial_anomalies();
END;
$$ LANGUAGE plpgsql;

-- Note: To schedule this function to run daily at 7 AM, you would typically use:
-- pg_cron extension (if available) or external cron job that calls this function
-- Example with pg_cron (if extension is enabled):
-- SELECT cron.schedule('daily-task-generation', '0 7 * * *', $$SELECT generate_daily_tasks()$$);

