#!/usr/bin/env python
"""
Script to add log_transaction calls to routers
"""
import re
import os

# Router configurations with their specific details
# Format: (filename, [(operation, result_var, id_var, log_code, id_field, extra_fields)])
ROUTERS_CONFIG = {
    'jobs_router.py': {
        'log_prefix': 'JOB',
        'id_field': 'jobId',
        'operations': [
            ('create_job', 'created', None, '_CREATED', {'name': 'name'}),
            ('update_job', 'updated', 'job_id', '_UPDATED', {}),
            ('delete_job', None, 'job_id', '_DELETED', {}),
            ('restore_job', None, 'job_id', '_RESTORED', {}),
        ]
    },
    'feedback_router.py': {
        'log_prefix': 'FEEDBACK',
        'id_field': 'feedbackId',
        'operations': [
            ('create_feedback', 'created_feedback', None, '_CREATED', {}),
            ('update_feedback', 'updated_feedback', 'feedback_id', '_UPDATED', {}),
            ('delete_feedback', None, 'feedback_id', '_DELETED', {}),
            ('restore_feedback', None, 'feedback_id', '_RESTORED', {}),
        ]
    },
    'feedback_master_router.py': {
        'log_prefix': 'FEEDBACK_MASTER',
        'id_field': 'feedbackMasterId',
        'operations': [
            ('create_feedback_master', 'created', None, '_CREATED', {'name': 'name'}),
            ('update_feedback_master', 'updated', 'feedback_master_id', '_UPDATED', {}),
            ('delete_feedback_master', None, 'feedback_master_id', '_DELETED', {}),
            ('restore_feedback_master', None, 'feedback_master_id', '_RESTORED', {}),
        ]
    },
    'unit_type_router.py': {
        'log_prefix': 'UNIT_TYPE',
        'id_field': 'unitTypeId',
        'operations': [
            ('create_unit_type', 'result', None, '_CREATED', {'name': 'name'}),
            ('update_unit_type', 'result', 'unit_type_id', '_UPDATED', {}),
            ('delete_unit_type', None, 'unit_type_id', '_DELETED', {}),
            ('restore_unit_type', None, 'unit_type_id', '_RESTORED', {}),
        ]
    },
    'unit_villages_router.py': {
        'log_prefix': 'UNIT_VILLAGES',
        'id_field': 'unitVillageId',
        'operations': [
            ('create_unit_village', 'result', None, '_CREATED', {}),
            ('update_unit_village', 'result', 'unit_village_id', '_UPDATED', {}),
            ('delete_unit_village', None, 'unit_village_id', '_DELETED', {}),
            ('restore_unit_village', None, 'unit_village_id', '_RESTORED', {}),
        ]
    },
    'error_master_router.py': {
        'log_prefix': 'ERROR_MASTER',
        'id_field': 'errorMasterId',
        'operations': [
            ('create_error_master', 'created', None, '_CREATED', {'errorCode': 'errorCode'}),
            ('update_error_master', 'updated', 'error_master_id', '_UPDATED', {}),
            ('delete_error_master', None, 'error_master_id', '_DELETED', {}),
            ('restore_error_master', None, 'error_master_id', '_RESTORED', {}),
        ]
    },
    'designation_master_router.py': {
        'log_prefix': 'DESIGNATION',
        'id_field': 'designationId',
        'operations': [
            ('create_designation', 'result', None, '_CREATED', {'name': 'name'}),
            ('update_designation', 'result', 'designation_id', '_UPDATED', {}),
            ('delete_designation', None, 'designation_id', '_DELETED', {}),
            ('restore_designation', None, 'designation_id', '_RESTORED', {}),
        ]
    },
    'test_master_router.py': {
        'log_prefix': 'TEST_MASTER',
        'id_field': 'testMasterId',
        'operations': [
            ('create_test_master', 'created', None, '_CREATED', {'name': 'name'}),
            ('update_test_master', 'updated', 'test_master_id', '_UPDATED', {}),
            ('delete_test_master', None, 'test_master_id', '_DELETED', {}),
            ('restore_test_master', None, 'test_master_id', '_RESTORED', {}),
        ]
    },
    'permissions_mapping_router.py': {
        'log_prefix': 'PERMISSION_MAPPING',
        'id_field': 'permissionMappingId',
        'operations': [
            ('create_permission_mapping', 'created', None, '_CREATED', {}),
            ('update_permission_mapping', 'updated', 'mapping_id', '_UPDATED', {}),
            ('delete_permission_mapping', None, 'mapping_id', '_DELETED', {}),
            ('restore_permission_mapping', None, 'mapping_id', '_RESTORED', {}),
        ]
    },
}

def generate_log_call(log_prefix, operation_suffix, id_field, id_value, extra_fields, action_by):
    """Generate log_transaction call"""
    action = operation_suffix.replace('_', '').lower() + 'By'

    json_vals = {id_field: id_value}
    json_vals.update(extra_fields)
    json_vals[action] = 'current_user.id'

    json_str = ',\n                '.join([f'"{k}": {v}' for k, v in json_vals.items()])

    return f'''
        # Log successful {operation_suffix.replace('_', '').lower()}
        await log_transaction(
            request=request,
            log_code=LogCodes.{log_prefix}{operation_suffix},
            json_values={{
                {json_str}
            }},
            level="info"
        )
'''

def process_router_manually(filepath, config):
    """Process a single router file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    modified = False

    for func_name, result_var, id_var, operation_suffix, extra_fields in config['operations']:
        # Build the ID value expression
        if id_var:
            id_value = id_var
        elif result_var:
            id_value = f'{result_var}.get("_id", "")'
        else:
            id_value = '""'

        # Build extra fields dict
        extra_dict = {k: f'{result_var}.get("{v}", "")' if result_var else '""' for k, v in extra_fields.items()}

        log_call = generate_log_call(config['log_prefix'], operation_suffix, config['id_field'], id_value, extra_dict, 'createdBy')

        # Find patterns to insert log calls
        # Pattern 1: after successful service call before return
        if result_var:
            pattern = rf'({result_var} = await {func_name}\([^)]+\))\s*\n(\s*)return JSONResponse'
            replacement = rf'\1\n{log_call}\n\2return JSONResponse'
        else:
            pattern = rf'(await {func_name}\([^)]+\))\s*\n(\s*)return JSONResponse'
            replacement = rf'\1\n{log_call}\n\2return JSONResponse'

        if re.search(pattern, content):
            content = re.sub(pattern, replacement, content)
            modified = True
            print(f"  [OK] Added log for {func_name}")
        else:
            print(f"  [SKIP] Pattern not found for {func_name}")

    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

    return modified

def main():
    basedir = 'app/api/v1/routers'

    for filename, config in ROUTERS_CONFIG.items():
        filepath = os.path.join(basedir, filename)
        if not os.path.exists(filepath):
            print(f"[ERROR] File not found: {filepath}")
            continue

        print(f"\nProcessing {filename}...")
        modified = process_router_manually(filepath, config)
        if modified:
            print(f"[SUCCESS] Successfully updated {filename}")
        else:
            print(f"[WARNING] No changes made to {filename}")

if __name__ == '__main__':
    main()
