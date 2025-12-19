#!/usr/bin/env python3
"""
Herramienta de migración de cierres a flujo de caja
Migra datos del sistema de cierres al sistema de flujo de caja
"""

import json
import sys
import getpass
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: Se requiere requests. Instala con: pip install requests")
    sys.exit(1)


# Configuración de Firebase
FIREBASE_API_KEY = "AIzaSyD02egBPI7FnsliANDKa8noTkVmGMW0POg"
FIREBASE_DATABASE_URL = "https://nrd-db-default-rtdb.firebaseio.com"


def authenticate_user(email, password):
    """Autentica un usuario con email y contraseña usando Firebase Auth REST API"""
    auth_url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
    
    payload = {
        "email": email,
        "password": password,
        "returnSecureToken": True
    }
    
    try:
        response = requests.post(auth_url, json=payload)
        response.raise_for_status()
        data = response.json()
        return data.get('idToken')
    except requests.exceptions.RequestException as e:
        print(f"Error al autenticar: {e}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_data = e.response.json()
                error_msg = error_data.get('error', {}).get('message', 'Error desconocido')
                print(f"Detalle: {error_msg}")
            except:
                pass
        return None


def firebase_get(ref_path, id_token):
    """Obtiene datos de Firebase Realtime Database usando REST API"""
    url = f"{FIREBASE_DATABASE_URL}/{ref_path}.json?auth={id_token}"
    try:
        response = requests.get(url)
        response.raise_for_status()
        return response.json() or {}
    except requests.exceptions.RequestException as e:
        print(f"Error al obtener datos de {ref_path}: {e}")
        return {}


def firebase_push(ref_path, data, id_token):
    """Crea un nuevo registro en Firebase Realtime Database usando REST API"""
    url = f"{FIREBASE_DATABASE_URL}/{ref_path}.json?auth={id_token}"
    try:
        response = requests.post(url, json=data)
        response.raise_for_status()
        result = response.json()
        return result.get('name')  # Retorna el ID generado
    except requests.exceptions.RequestException as e:
        print(f"Error al crear registro en {ref_path}: {e}")
        return None


def load_mapping_file(mapping_path=None):
    """Carga el archivo de mapeo"""
    if mapping_path is None:
        # Buscar en la misma carpeta del script
        script_dir = Path(__file__).parent
        mapping_path = script_dir / "migration-mapping.json"
    
    try:
        with open(mapping_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Advertencia: No se encontró {mapping_path}, usando mapeo vacío")
        return {"accounts": {}, "categories": {}}
    except json.JSONDecodeError as e:
        print(f"Error al parsear {mapping_path}: {e}")
        return {"accounts": {}, "categories": {}}


def load_closures_file(json_path):
    """Carga el archivo JSON de cierres"""
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: No se encontró el archivo {json_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error al parsear {json_path}: {e}")
        sys.exit(1)


def extract_unique_accounts(closures):
    """Extrae todas las cuentas únicas del JSON"""
    accounts_map = {}
    for closure in closures.values():
        if 'accounts' in closure and isinstance(closure['accounts'], list):
            for account in closure['accounts']:
                account_id = account.get('id')
                if account_id and account_id not in accounts_map:
                    accounts_map[account_id] = {
                        'name': account.get('name', ''),
                        'originalId': account_id
                    }
    return accounts_map


def extract_unique_categories(closures):
    """Extrae todas las categorías únicas del JSON"""
    categories_map = {}
    for closure in closures.values():
        if 'transactions' in closure and isinstance(closure['transactions'], list):
            for transaction in closure['transactions']:
                concept = transaction.get('concept', '')
                if concept:
                    # Limpiar concepto
                    clean_concept = concept.replace('(+)', '').replace('(-)', '').strip()
                    if clean_concept and clean_concept not in categories_map:
                        is_income = concept.startswith('(+)') or (transaction.get('amount', 0) > 0)
                        categories_map[clean_concept] = {
                            'name': clean_concept,
                            'type': 'income' if is_income else 'expense',
                            'originalConcept': concept
                        }
    return categories_map


def migrate_accounts(accounts_map, account_mapping, id_token):
    """Migra las cuentas a Firebase"""
    print(f"\nPaso 3: Migrando {len(accounts_map)} cuentas a Firebase...")
    account_id_map = {}
    
    # Obtener cuentas existentes
    existing_accounts = firebase_get('accounts', id_token)
    
    for old_id, account_data in accounts_map.items():
        try:
            # Buscar en el mapeo
            mapped_name = account_mapping.get(old_id, account_data['name'])
            
            # Verificar si ya existe
            existing_id = None
            for acc_id, acc in existing_accounts.items():
                if acc and acc.get('name') == mapped_name:
                    existing_id = acc_id
                    break
            
            if existing_id:
                account_id_map[old_id] = existing_id
                print(f"  ✓ Cuenta '{mapped_name}' ya existe ({existing_id})")
            else:
                # Crear nueva cuenta
                new_id = firebase_push('accounts', {'name': mapped_name}, id_token)
                if new_id:
                    account_id_map[old_id] = new_id
                    print(f"  ✓ Cuenta creada: '{mapped_name}' ({new_id})")
        except Exception as e:
            print(f"  ✗ Error al crear cuenta '{account_data['name']}': {e}")
    
    return account_id_map


def migrate_categories(categories_map, category_mapping, description_rules, id_token):
    """Verifica que las categorías mapeadas existan en Firebase - NO crea nuevas categorías"""
    print(f"\nPaso 4: Verificando categorías mapeadas en Firebase...")
    category_name_map = {}
    
    # Obtener categorías existentes
    existing_categories = firebase_get('categories', id_token)
    print(f"  Categorías existentes en Firebase: {len(existing_categories)}")
    
    # Crear un mapa de categorías existentes por nombre y tipo (case-insensitive)
    existing_categories_map = {}
    for cat_id, cat in existing_categories.items():
        if cat:
            cat_name = cat.get('name', '').strip()
            cat_type = cat.get('type', '').strip()
            if cat_name and cat_type:
                # Usar nombre en mayúsculas como clave para comparación case-insensitive
                key = f"{cat_name.upper()}|{cat_type.lower()}"
                if key not in existing_categories_map:
                    existing_categories_map[key] = cat_id
                    print(f"    - {cat_name} ({cat_type})")
    
    # Procesar categorías del mapeo directo
    mapped_count = 0
    missing_categories = []
    
    for original_concept, category_data in categories_map.items():
        # Buscar en el mapeo (por concepto limpio o concepto original)
        mapped_category = category_mapping.get(original_concept) or category_mapping.get(category_data['originalConcept'])
        
        # Si no está mapeada, omitir
        if not mapped_category:
            continue
        
        # Si debe omitirse explícitamente
        if mapped_category.get('skip'):
            print(f"  ⊘ Categoría '{original_concept}' omitida por mapeo")
            continue
        
        mapped_count += 1
        try:
            target_name = mapped_category.get('name')
            target_type = mapped_category.get('type')
            
            if not target_name or not target_type:
                print(f"  ⚠ Categoría '{original_concept}' mapeada pero falta 'name' o 'type'")
                continue
            
            # Buscar categoría existente (case-insensitive)
            search_key = f"{target_name.upper()}|{target_type.lower()}"
            existing_id = existing_categories_map.get(search_key)
            
            if existing_id:
                category_name_map[original_concept] = existing_id
                print(f"  ✓ Categoría '{target_name}' encontrada ({existing_id})")
            else:
                missing_categories.append(f"'{target_name}' ({target_type})")
                print(f"  ❌ ERROR: Categoría '{target_name}' ({target_type}) NO EXISTE en Firebase")
                print(f"     Concepto original: '{original_concept}'")
        except Exception as e:
            print(f"  ✗ Error al procesar categoría '{original_concept}': {e}")
    
    # Procesar categorías de las reglas de descripción
    rule_categories_processed = set()
    for rule in description_rules:
        rule_category = rule.get('category')
        if rule_category:
            target_name = rule_category.get('name')
            target_type = rule_category.get('type')
            
            if not target_name or not target_type:
                continue
            
            # Evitar procesar la misma categoría múltiples veces
            category_key = f"{target_name.upper()}|{target_type.lower()}"
            if category_key in rule_categories_processed:
                continue
            rule_categories_processed.add(category_key)
            
            # Buscar categoría existente (case-insensitive)
            existing_id = existing_categories_map.get(category_key)
            
            if existing_id:
                print(f"  ✓ Categoría de regla '{target_name}' encontrada ({existing_id})")
            else:
                missing_categories.append(f"'{target_name}' ({target_type})")
                print(f"  ❌ ERROR: Categoría de regla '{target_name}' ({target_type}) NO EXISTE en Firebase")
    
    print(f"\n  Total de categorías mapeadas procesadas: {mapped_count}")
    print(f"  Total de categorías de reglas procesadas: {len(rule_categories_processed)}")
    
    if missing_categories:
        print(f"\n  ⚠ ADVERTENCIA: {len(missing_categories)} categorías mapeadas NO EXISTEN en Firebase:")
        for cat in missing_categories:
            print(f"     - {cat}")
        print(f"  Por favor, crea estas categorías en Firebase antes de continuar.")
    
    return category_name_map


def timestamp_to_local_date(timestamp):
    """Convierte timestamp a fecha local (inicio del día)"""
    dt = datetime.fromtimestamp(timestamp / 1000)  # Firebase usa milisegundos
    local_date = datetime(dt.year, dt.month, dt.day, 0, 0, 0)
    return int(local_date.timestamp() * 1000)


def find_category_mapping(transaction, category_mapping, description_rules):
    """Encuentra el mapeo de categoría para una transacción"""
    concept = transaction.get('concept', '')
    clean_concept = concept.replace('(+)', '').replace('(-)', '').strip() if concept else None
    description = transaction.get('description', '').strip().lower() if transaction.get('description') else ''
    
    # 1. Buscar mapeo directo por concepto
    mapped_category = category_mapping.get(concept) or (clean_concept and category_mapping.get(clean_concept))
    
    # 2. Si no hay mapeo directo, buscar por reglas de descripción
    if not mapped_category and description:
        for rule in description_rules:
            keywords = rule.get('keywords', [])
            # Verificar si alguna palabra clave está en la descripción
            for keyword in keywords:
                if keyword.lower() in description:
                    mapped_category = rule.get('category')
                    break
            if mapped_category:
                break
    
    return mapped_category


def migrate_transactions(closures, account_id_map, category_name_map, 
                        account_mapping, category_mapping, description_rules, id_token):
    """Migra las transacciones a Firebase"""
    print("\nPaso 5: Preparando transacciones...")
    
    # Contar transacciones totales (solo las que tienen categorías mapeadas)
    total_transactions = 0
    for closure in closures.values():
        if 'transactions' in closure and isinstance(closure['transactions'], list):
            for transaction in closure['transactions']:
                if transaction.get('transferId'):
                    continue
                # Verificar si está mapeada (por concepto o por reglas de descripción)
                mapped_category = find_category_mapping(transaction, category_mapping, description_rules)
                
                # Solo contar si está mapeada y no debe omitirse
                if mapped_category and not mapped_category.get('skip'):
                    total_transactions += 1
    
    print(f"  Total de transacciones a migrar: {total_transactions}")
    
    # Cachear todas las categorías y cuentas
    print("  Cargando cache de categorías y cuentas...")
    all_categories = firebase_get('categories', id_token)
    all_accounts = firebase_get('accounts', id_token)
    
    # Crear mapa rápido de categorías (case-insensitive)
    category_cache = {}
    for cat_id, cat in all_categories.items():
        if cat:
            cat_name = cat.get('name', '').strip()
            cat_type = cat.get('type', '').strip()
            if cat_name and cat_type:
                # Usar nombre en mayúsculas como clave para comparación case-insensitive
                key = f"{cat_name.upper()}|{cat_type.lower()}"
                # Si ya existe, mantener el primero (evitar duplicados)
                if key not in category_cache:
                    category_cache[key] = cat_id
    
    print("\nPaso 6: Migrando transacciones...")
    migrated_count = 0
    skipped_count = 0
    error_count = 0
    
    for closure_id, closure in closures.items():
        if 'transactions' not in closure or not isinstance(closure['transactions'], list):
            continue
        
        for transaction in closure['transactions']:
            # Omitir transferencias
            if transaction.get('transferId'):
                skipped_count += 1
                continue
            
            try:
                # Verificar si está mapeada - SOLO procesar transacciones con categorías mapeadas
                concept = transaction.get('concept', '')
                clean_concept = concept.replace('(+)', '').replace('(-)', '').strip() if concept else None
                description = transaction.get('description', '').strip() if transaction.get('description') else ''
                
                # Buscar mapeo (por concepto o por reglas de descripción)
                mapped_category = find_category_mapping(transaction, category_mapping, description_rules)
                
                # Si se encontró por regla de descripción, mostrar mensaje
                if mapped_category and description:
                    description_lower = description.lower()
                    found_by_rule = False
                    matched_keyword = None
                    for rule in description_rules:
                        keywords = rule.get('keywords', [])
                        for keyword in keywords:
                            if keyword.lower() in description_lower:
                                found_by_rule = True
                                matched_keyword = keyword
                                break
                        if found_by_rule:
                            break
                    
                    if found_by_rule:
                        print(f"  ✓ Mapeo por palabra clave: '{matched_keyword}' → '{mapped_category.get('name')}'")
                
                # Si no está mapeada, omitir
                if not mapped_category:
                    print(f"  ⚠ OMITIDA: Transacción {transaction.get('id')} - CATEGORÍA NO MAPEADA")
                    print(f"     Concepto: '{concept}'")
                    if clean_concept:
                        print(f"     Concepto limpio: '{clean_concept}'")
                    print(f"     Descripción: {description or 'N/A'}")
                    skipped_count += 1
                    continue
                
                # Si debe omitirse explícitamente
                if mapped_category.get('skip'):
                    skipped_count += 1
                    continue
                
                # 1. Type
                is_income = concept.startswith('(+)') if concept else (transaction.get('amount', 0) > 0)
                transaction_type = 'income' if is_income else 'expense'
                
                # 2. Description
                final_clean_concept = clean_concept or 'Sin descripción'
                description = transaction.get('description', '').strip() or final_clean_concept
                
                # 3. Amount - Validar que existe y es válido
                raw_amount = transaction.get('amount')
                if raw_amount is None:
                    print(f"  ❌ ERROR: Transacción {transaction.get('id')} - FALTA IMPORTE (amount)")
                    print(f"     Concepto: '{concept}'")
                    print(f"     Descripción: {transaction.get('description', 'N/A')}")
                    error_count += 1
                    continue
                
                try:
                    amount = abs(float(raw_amount))
                except (ValueError, TypeError):
                    print(f"  ❌ ERROR: Transacción {transaction.get('id')} - IMPORTE INVÁLIDO")
                    print(f"     Importe recibido: {raw_amount} (tipo: {type(raw_amount).__name__})")
                    print(f"     Concepto: '{concept}'")
                    print(f"     Descripción: {transaction.get('description', 'N/A')}")
                    error_count += 1
                    continue
                
                if amount == 0:
                    print(f"  ⚠ ADVERTENCIA: Transacción {transaction.get('id')} - IMPORTE ES CERO")
                    print(f"     Concepto: '{concept}'")
                    print(f"     Descripción: {transaction.get('description', 'N/A')}")
                    error_count += 1
                    continue
                
                category_name = mapped_category.get('name')
                category_type = mapped_category.get('type', transaction_type)
                
                if not category_name:
                    print(f"  ❌ ERROR: Transacción {transaction.get('id')} - CATEGORÍA MAPEADA PERO SIN 'name'")
                    print(f"     Concepto: '{concept}'")
                    print(f"     Mapeo: {mapped_category}")
                    error_count += 1
                    continue
                
                # Buscar el ID de la categoría en el cache (case-insensitive)
                cache_key = f"{category_name.upper()}|{category_type.lower()}"
                category_id = category_cache.get(cache_key)
                
                if not category_id:
                    print(f"  ❌ ERROR: Transacción {transaction.get('id')} - CATEGORÍA NO ENCONTRADA EN FIREBASE")
                    print(f"     Categoría mapeada: '{category_name}' (tipo: {category_type})")
                    print(f"     Concepto original: '{concept}'")
                    print(f"     Descripción: {transaction.get('description', 'N/A')}")
                    print(f"     Buscando en cache con clave: '{cache_key}'")
                    error_count += 1
                    continue
                
                # 5. Account - Validar que existe
                account_id_old = transaction.get('accountId')
                if not account_id_old:
                    print(f"  ❌ ERROR: Transacción {transaction.get('id')} - FALTA CUENTA (accountId)")
                    print(f"     Concepto: '{concept}'")
                    print(f"     Descripción: {transaction.get('description', 'N/A')}")
                    error_count += 1
                    continue
                
                target_account_id = account_id_map.get(account_id_old)
                
                if not target_account_id:
                    print(f"  ❌ ERROR: Transacción {transaction.get('id')} - CUENTA NO MAPEADA O NO ENCONTRADA")
                    print(f"     AccountId original: '{account_id_old}'")
                    print(f"     Concepto: '{concept}'")
                    print(f"     Descripción: {transaction.get('description', 'N/A')}")
                    error_count += 1
                    continue
                
                # Obtener nombre de cuenta del cache
                account = all_accounts.get(target_account_id, {})
                mapped_account_name = account_mapping.get(account_id_old)
                account_name = account.get('name') if account else (mapped_account_name or 'Sin cuenta')
                
                # 6. Date
                timestamp = transaction.get('timestamp', int(datetime.now().timestamp() * 1000))
                date = timestamp_to_local_date(timestamp)
                
                # 7. Notes
                notes = transaction.get('description', '').strip() or None
                
                # Crear transacción
                transaction_data = {
                    'type': transaction_type,
                    'description': description,
                    'amount': amount,
                    'categoryId': category_id,
                    'categoryName': category_name,
                    'accountId': target_account_id,
                    'accountName': account_name,
                    'date': date,
                    'notes': notes,
                    'createdAt': timestamp
                }
                
                new_id = firebase_push('transactions', transaction_data, id_token)
                if new_id:
                    migrated_count += 1
                    
                    # Actualizar progreso cada 10 transacciones
                    if migrated_count % 10 == 0:
                        progress = f"{migrated_count}/{total_transactions}"
                        print(f"  Progreso: {progress} transacciones migradas...")
                else:
                    error_count += 1
                
            except Exception as e:
                print(f"  ✗ Error al migrar transacción {transaction.get('id')}: {e}")
                error_count += 1
    
    return {
        'migrated': migrated_count,
        'skipped': skipped_count,
        'errors': error_count
    }


def main():
    """Función principal"""
    print("=" * 60)
    print("Herramienta de Migración de Cierres a Flujo de Caja")
    print("=" * 60)
    
    # Verificar argumentos
    if len(sys.argv) < 2:
        print("\nUso: python migrate-closures.py <archivo-cierres.json> [email] [contraseña]")
        print("\nEjemplo:")
        print("  python migrate-closures.py nrd-cierres-prod-default-rtdb-closures-export.json")
        print("  python migrate-closures.py nrd-cierres-prod-default-rtdb-closures-export.json usuario@email.com contraseña")
        sys.exit(1)
    
    json_path = sys.argv[1]
    
    # Obtener credenciales (argumentos o input interactivo)
    if len(sys.argv) >= 4:
        email = sys.argv[2].strip()
        password = sys.argv[3]
    else:
        # Pedir credenciales interactivamente
        try:
            print("\nAutenticación requerida:")
            email = input("Email: ").strip()
            password = getpass.getpass("Contraseña: ")
        except (EOFError, KeyboardInterrupt):
            print("\n\nError: Se requiere email y contraseña.")
            print("Puedes proporcionarlos como argumentos:")
            print("  python migrate-closures.py <archivo.json> <email> <contraseña>")
            sys.exit(1)
    
    if not email or not password:
        print("Error: Email y contraseña son requeridos")
        sys.exit(1)
    
    # Autenticar usuario
    print("\nAutenticando...")
    id_token = authenticate_user(email, password)
    
    if not id_token:
        print("Error: No se pudo autenticar. Verifica tu email y contraseña.")
        sys.exit(1)
    
    print("✓ Usuario autenticado correctamente")
    
    # Cargar archivos
    print("\nPaso 1: Cargando archivos...")
    mapping_data = load_mapping_file()
    closures_data = load_closures_file(json_path)
    print(f"✓ Archivo de cierres cargado: {len(closures_data)} cierres")
    
    # Extraer datos únicos
    print("\nPaso 1: Extrayendo cuentas únicas...")
    accounts_map = extract_unique_accounts(closures_data)
    print(f"✓ {len(accounts_map)} cuentas únicas encontradas")
    
    print("\nPaso 2: Extrayendo categorías únicas...")
    categories_map = extract_unique_categories(closures_data)
    print(f"✓ {len(categories_map)} categorías únicas encontradas")
    
    # Migrar
    account_mapping = mapping_data.get('accounts', {})
    category_mapping = mapping_data.get('categories', {})
    description_rules = mapping_data.get('descriptionRules', [])
    
    account_id_map = migrate_accounts(accounts_map, account_mapping, id_token)
    category_name_map = migrate_categories(categories_map, category_mapping, description_rules, id_token)
    
    results = migrate_transactions(
        closures_data, 
        account_id_map, 
        category_name_map,
        account_mapping,
        category_mapping,
        description_rules,
        id_token
    )
    
    # Resumen
    print("\n" + "=" * 60)
    print("Migración completada")
    print("=" * 60)
    print(f"Cuentas migradas: {len(accounts_map)}")
    print(f"Categorías migradas: {len(categories_map)}")
    print(f"Transacciones migradas: {results['migrated']}")
    print(f"Transacciones omitidas: {results['skipped']}")
    print(f"Errores: {results['errors']}")
    print("=" * 60)


if __name__ == '__main__':
    main()
