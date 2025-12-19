-- Azure PostgreSQL Database Schema for Studio by yAI
-- Production-verified schema with Template Version History and Run Snapshots
-- Last verified: 2025

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- CORE TABLES (10 tables in production)
-- =============================================

-- Projects table
CREATE TABLE IF NOT EXISTS "projects" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "long_description" TEXT,
    "user_id" UUID NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "metadata" JSONB
);

-- Files table
CREATE TABLE IF NOT EXISTS "files" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "user_id" UUID,
    "file_name" TEXT,
    "file_path" TEXT,
    "file_hash" TEXT,
    "file_size" INTEGER,
    "metadata" JSONB,
    "file_map" JSONB,
    "page_map" JSONB,
    "processing_status" TEXT,
    "excel_file_map" JSONB,
    "sheet_map" JSONB
);

-- Templates table with version history in metadata
CREATE TABLE IF NOT EXISTS "templates" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT,
    "owner_id" UUID,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "metadata" JSONB
);

-- Fields table
CREATE TABLE IF NOT EXISTS "fields" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "template_id" UUID REFERENCES "templates"("id") ON DELETE CASCADE,
    "name" TEXT,
    "description" TEXT,
    "sort_order" INTEGER,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "metadata" JSONB,
    "created_by" UUID,
    "updated_at" TIMESTAMP WITH TIME ZONE,
    "updated_by" UUID,
    "edit_history" JSONB DEFAULT '[]'::jsonb
);

-- Runs table with snapshots in metadata
CREATE TABLE IF NOT EXISTS "runs" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "template_id" UUID REFERENCES "templates"("id") ON DELETE CASCADE,
    "project_id" UUID REFERENCES "projects"("id") ON DELETE CASCADE,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "status" TEXT,
    "run_by" UUID,
    "completed_at" TIMESTAMP WITH TIME ZONE,
    "metadata" JSONB
);

-- Results table - NO foreign key on field_id (CASCADE DELETE removed)
CREATE TABLE IF NOT EXISTS "results" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "run_id" UUID REFERENCES "runs"("id") ON DELETE CASCADE,
    "field_id" UUID NOT NULL,  -- Just a UUID, NOT a foreign key
    "value" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "status" TEXT,
    "line_map" JSONB,
    "audit" JSONB DEFAULT '{}'::jsonb
);

-- Junction table: Project-Files
CREATE TABLE IF NOT EXISTS "project_files" (
    "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
    "file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
    "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "added_by" UUID,
    PRIMARY KEY ("project_id", "file_id")
);

-- Junction table: Project-Templates
CREATE TABLE IF NOT EXISTS "project_templates" (
    "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
    "template_id" UUID NOT NULL REFERENCES "templates"("id") ON DELETE CASCADE,
    "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "added_by" UUID,
    PRIMARY KEY ("project_id", "template_id")
);

-- User profiles table (Azure AD integration)
CREATE TABLE IF NOT EXISTS "user_profiles" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "azure_id" UUID NOT NULL UNIQUE,
    "email" TEXT NOT NULL UNIQUE,
    "display_name" TEXT,
    "given_name" TEXT,
    "surname" TEXT,
    "job_title" TEXT,
    "department" TEXT,
    "company_name" TEXT,
    "profile_picture_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Project permissions table
CREATE TABLE IF NOT EXISTS "project_permissions" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
    "granted_by" UUID NOT NULL,
    "granted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE ("project_id", "user_id")
);

-- =============================================
-- INDEXES
-- =============================================

-- Projects indexes
CREATE INDEX IF NOT EXISTS "idx_projects_user_id" ON "projects" ("user_id");

-- Files indexes
CREATE INDEX IF NOT EXISTS "idx_files_user_id" ON "files" ("user_id");

-- Templates indexes
CREATE INDEX IF NOT EXISTS "idx_templates_owner_id" ON "templates" ("owner_id");
CREATE INDEX IF NOT EXISTS "idx_templates_version_history" ON "templates" USING GIN ((metadata->'version_history'));

-- Fields indexes
CREATE INDEX IF NOT EXISTS "idx_fields_template_id" ON "fields" ("template_id");

-- Runs indexes
CREATE INDEX IF NOT EXISTS "idx_runs_template_id" ON "runs" ("template_id");
CREATE INDEX IF NOT EXISTS "idx_runs_project_id" ON "runs" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_runs_template_snapshot" ON "runs" USING GIN ((metadata->'template_snapshot'));

-- Results indexes
CREATE INDEX IF NOT EXISTS "idx_results_run_id" ON "results" ("run_id");
CREATE INDEX IF NOT EXISTS "idx_results_field_id" ON "results" ("field_id");

-- Junction table indexes
CREATE INDEX IF NOT EXISTS "idx_project_files_project_id" ON "project_files" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_files_file_id" ON "project_files" ("file_id");
CREATE INDEX IF NOT EXISTS "idx_project_templates_project_id" ON "project_templates" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_templates_template_id" ON "project_templates" ("template_id");

-- User profiles indexes
CREATE INDEX IF NOT EXISTS "idx_user_profiles_azure_id" ON "user_profiles" ("azure_id");
CREATE INDEX IF NOT EXISTS "idx_user_profiles_email" ON "user_profiles" ("email");
CREATE INDEX IF NOT EXISTS "idx_user_profiles_active" ON "user_profiles" ("is_active");

-- Project permissions indexes
CREATE INDEX IF NOT EXISTS "idx_project_permissions_project_id" ON "project_permissions" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_permissions_user_id" ON "project_permissions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_project_permissions_role" ON "project_permissions" ("role");
CREATE INDEX IF NOT EXISTS "idx_project_permissions_user_project" ON "project_permissions" ("user_id", "project_id");

-- =============================================
-- VERSION TRACKING FUNCTIONS
-- =============================================

-- Get template version
CREATE OR REPLACE FUNCTION get_template_version(
    p_template_id UUID,
    p_version_number INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    template_metadata JSONB;
    version_history JSONB;
    current_version INTEGER;
BEGIN
    SELECT metadata INTO template_metadata
    FROM templates
    WHERE id = p_template_id;

    IF template_metadata IS NULL THEN
        RETURN NULL;
    END IF;

    version_history := template_metadata->'version_history';

    IF version_history IS NULL OR jsonb_array_length(version_history) = 0 THEN
        RETURN NULL;
    END IF;

    IF p_version_number IS NULL THEN
        current_version := COALESCE((template_metadata->>'current_version')::INTEGER,
                                     jsonb_array_length(version_history));
        p_version_number := current_version;
    END IF;

    FOR i IN 0..jsonb_array_length(version_history)-1 LOOP
        IF (version_history->i->>'version')::INTEGER = p_version_number THEN
            RETURN version_history->i;
        END IF;
    END LOOP;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Save template version
CREATE OR REPLACE FUNCTION save_template_version(
    p_template_id UUID,
    p_change_type VARCHAR,
    p_change_description TEXT
)
RETURNS INTEGER AS $$
DECLARE
    current_metadata JSONB;
    current_fields JSONB;
    new_version INTEGER;
    new_version_entry JSONB;
    template_name TEXT;
BEGIN
    SELECT t.metadata, t.name
    INTO current_metadata, template_name
    FROM templates t
    WHERE t.id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found: %', p_template_id;
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', f.id,
            'name', f.name,
            'description', f.description,
            'sort_order', f.sort_order,
            'metadata', f.metadata,
            'created_at', f.created_at,
            'created_by', f.created_by,
            'updated_at', f.updated_at,
            'updated_by', f.updated_by,
            'edit_history', f.edit_history
        ) ORDER BY f.sort_order
    ) INTO current_fields
    FROM fields f
    WHERE f.template_id = p_template_id;

    IF current_metadata->'version_history' IS NULL THEN
        new_version := 1;
    ELSE
        new_version := COALESCE((current_metadata->>'current_version')::INTEGER,
                                 jsonb_array_length(current_metadata->'version_history')) + 1;
    END IF;

    new_version_entry := jsonb_build_object(
        'version', new_version,
        'created_at', CURRENT_TIMESTAMP,
        'snapshot', jsonb_build_object(
            'name', template_name,
            'metadata', current_metadata - 'version_history' - 'current_version',
            'fields', COALESCE(current_fields, '[]'::jsonb)
        ),
        'change_type', p_change_type,
        'change_description', p_change_description
    );

    UPDATE templates
    SET metadata = jsonb_set(
        jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{version_history}',
            COALESCE(metadata->'version_history', '[]'::jsonb) || new_version_entry
        ),
        '{current_version}',
        to_jsonb(new_version)
    )
    WHERE id = p_template_id;

    RETURN new_version;
END;
$$ LANGUAGE plpgsql;

-- Restore template version
CREATE OR REPLACE FUNCTION restore_template_version(
    p_template_id UUID,
    p_version_number INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    version_data JSONB;
    snapshot JSONB;
    field_data JSONB;
    restored_version INTEGER;
BEGIN
    version_data := get_template_version(p_template_id, p_version_number);

    IF version_data IS NULL THEN
        RAISE EXCEPTION 'Version % not found for template %', p_version_number, p_template_id;
    END IF;

    snapshot := version_data->'snapshot';

    BEGIN
        DELETE FROM fields WHERE template_id = p_template_id;

        UPDATE templates
        SET name = snapshot->>'name',
            metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{restored_from_version}',
                to_jsonb(p_version_number)
            )
        WHERE id = p_template_id;

        FOR field_data IN SELECT * FROM jsonb_array_elements(snapshot->'fields')
        LOOP
            INSERT INTO fields (
                id,
                template_id,
                name,
                description,
                sort_order,
                metadata,
                created_at,
                created_by,
                updated_at,
                updated_by,
                edit_history
            ) VALUES (
                (field_data->>'id')::UUID,
                p_template_id,
                field_data->>'name',
                field_data->>'description',
                COALESCE((field_data->>'sort_order')::INTEGER, 0),
                COALESCE(field_data->'metadata', '{}'::jsonb),
                COALESCE((field_data->>'created_at')::TIMESTAMP WITH TIME ZONE, NOW()),
                (field_data->>'created_by')::UUID,
                (field_data->>'updated_at')::TIMESTAMP WITH TIME ZONE,
                (field_data->>'updated_by')::UUID,
                COALESCE(field_data->'edit_history', '[]'::jsonb)
            );
        END LOOP;

        restored_version := save_template_version(
            p_template_id,
            'restored',
            format('Restored from version %s', p_version_number)
        );

        RETURN TRUE;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE;
    END;
END;
$$ LANGUAGE plpgsql;

-- Get template history
CREATE OR REPLACE FUNCTION get_template_history(p_template_id UUID)
RETURNS TABLE (
    version INTEGER,
    created_at TIMESTAMP,
    change_type TEXT,
    change_description TEXT,
    field_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (vh->>'version')::INTEGER as version,
        (vh->>'created_at')::TIMESTAMP as created_at,
        (vh->>'change_type')::TEXT as change_type,
        (vh->>'change_description')::TEXT as change_description,
        jsonb_array_length(vh->'snapshot'->'fields') as field_count
    FROM templates t,
         jsonb_array_elements(t.metadata->'version_history') as vh
    WHERE t.id = p_template_id
    ORDER BY (vh->>'version')::INTEGER DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- USER PROFILE FUNCTIONS
-- =============================================

-- Function to upsert user profiles
CREATE OR REPLACE FUNCTION upsert_user_profile(
    p_azure_id UUID,
    p_email TEXT,
    p_display_name TEXT,
    p_given_name TEXT,
    p_surname TEXT,
    p_job_title TEXT,
    p_department TEXT,
    p_company_name TEXT,
    p_profile_picture_url TEXT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_profiles (
        azure_id,
        email,
        display_name,
        given_name,
        surname,
        job_title,
        department,
        company_name,
        profile_picture_url,
        is_active,
        last_login_at,
        created_at,
        updated_at
    ) VALUES (
        p_azure_id,
        p_email,
        p_display_name,
        p_given_name,
        p_surname,
        p_job_title,
        p_department,
        p_company_name,
        p_profile_picture_url,
        true,
        now(),
        now(),
        now()
    )
    ON CONFLICT (azure_id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        given_name = EXCLUDED.given_name,
        surname = EXCLUDED.surname,
        job_title = EXCLUDED.job_title,
        department = EXCLUDED.department,
        company_name = EXCLUDED.company_name,
        profile_picture_url = EXCLUDED.profile_picture_url,
        last_login_at = now(),
        updated_at = now(),
        is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Function to find user by email
CREATE OR REPLACE FUNCTION find_user_by_email(p_email TEXT)
RETURNS TABLE (
    id UUID,
    azure_id UUID,
    email TEXT,
    display_name TEXT,
    given_name TEXT,
    surname TEXT,
    job_title TEXT,
    department TEXT,
    company_name TEXT,
    profile_picture_url TEXT,
    is_active BOOLEAN,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $function$
BEGIN
    RETURN QUERY
    SELECT
        up.id,
        up.azure_id,
        up.email,
        up.display_name,
        up.given_name,
        up.surname,
        up.job_title,
        up.department,
        up.company_name,
        up.profile_picture_url,
        up.is_active,
        up.last_login_at,
        up.created_at,
        up.updated_at
    FROM user_profiles up
    WHERE up.email = p_email
    AND up.is_active = true;
END;
$function$ LANGUAGE plpgsql;

-- Function to check user project permissions
CREATE OR REPLACE FUNCTION user_has_project_permission(
    p_user_id UUID,
    p_project_id UUID,
    p_required_role TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $function$
DECLARE
    user_role TEXT;
    project_owner UUID;
BEGIN
    -- Check if user is the project owner
    SELECT user_id INTO project_owner
    FROM projects
    WHERE id = p_project_id;

    IF project_owner = p_user_id THEN
        RETURN TRUE;
    END IF;

    -- Check project permissions table
    SELECT role INTO user_role
    FROM project_permissions
    WHERE project_id = p_project_id
    AND user_id = p_user_id;

    -- If no specific role required, just check if user has any permission
    IF p_required_role IS NULL THEN
        RETURN user_role IS NOT NULL;
    END IF;

    -- Check specific role requirements
    IF p_required_role = 'owner' THEN
        RETURN project_owner = p_user_id;
    ELSIF p_required_role = 'editor' THEN
        RETURN user_role IN ('owner', 'editor') OR project_owner = p_user_id;
    END IF;

    RETURN user_role = p_required_role;
END;
$function$ LANGUAGE plpgsql;

-- Function to get project members with profiles
CREATE OR REPLACE FUNCTION get_project_members_with_profiles(p_project_id UUID)
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    display_name TEXT,
    profile_picture_url TEXT,
    role TEXT,
    granted_at TIMESTAMP WITH TIME ZONE,
    granted_by UUID
) AS $function$
BEGIN
    RETURN QUERY
    -- Get project owner
    SELECT
        p.user_id,
        COALESCE(up.email, 'user-' || substring(p.user_id::text, 1, 8) || '@unknown.com') as email,
        COALESCE(up.display_name, 'No name') as display_name,
        up.profile_picture_url,
        'owner'::text as role,
        p.created_at as granted_at,
        p.user_id as granted_by
    FROM projects p
    LEFT JOIN user_profiles up ON p.user_id = up.azure_id
    WHERE p.id = p_project_id

    UNION ALL

    -- Get project permissions
    SELECT
        pp.user_id,
        COALESCE(up.email, 'user-' || substring(pp.user_id::text, 1, 8) || '@unknown.com') as email,
        COALESCE(up.display_name, 'No name') as display_name,
        up.profile_picture_url,
        pp.role,
        pp.granted_at,
        pp.granted_by
    FROM project_permissions pp
    LEFT JOIN user_profiles up ON pp.user_id = up.azure_id
    WHERE pp.project_id = p_project_id

    ORDER BY granted_at DESC;
END;
$function$ LANGUAGE plpgsql;