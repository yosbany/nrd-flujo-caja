#!/usr/bin/env python3
"""
Script para listar todas las descripciones únicas de las transacciones
"""

import json
import sys
from collections import Counter

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


def extract_descriptions(closures):
    """Extrae todas las descripciones únicas de las transacciones"""
    descriptions = []
    concepts = []
    
    for closure in closures.values():
        if 'transactions' in closure and isinstance(closure['transactions'], list):
            for transaction in closure['transactions']:
                # Omitir transferencias
                if transaction.get('transferId'):
                    continue
                
                description = transaction.get('description', '').strip()
                concept = transaction.get('concept', '').strip()
                
                if description:
                    descriptions.append(description)
                if concept:
                    concepts.append(concept)
    
    return descriptions, concepts


def main():
    """Función principal"""
    if len(sys.argv) < 2:
        print("\nUso: python list-descriptions.py <archivo-cierres.json>")
        print("\nEjemplo:")
        print("  python list-descriptions.py nrd-cierres-prod-default-rtdb-closures-export.json")
        sys.exit(1)
    
    json_path = sys.argv[1]
    
    print("=" * 60)
    print("Listado de Descripciones de Transacciones")
    print("=" * 60)
    
    # Cargar archivo
    print(f"\nCargando archivo: {json_path}...")
    closures_data = load_closures_file(json_path)
    print(f"✓ Archivo cargado: {len(closures_data)} cierres")
    
    # Extraer descripciones
    print("\nExtrayendo descripciones...")
    descriptions, concepts = extract_descriptions(closures_data)
    
    # Contar frecuencia
    desc_counter = Counter(descriptions)
    concept_counter = Counter(concepts)
    
    print(f"\n{'='*60}")
    print(f"RESUMEN")
    print(f"{'='*60}")
    print(f"Total de transacciones procesadas: {len(descriptions)}")
    print(f"Descripciones únicas: {len(desc_counter)}")
    print(f"Conceptos únicos: {len(concept_counter)}")
    
    # Mostrar descripciones más frecuentes
    print(f"\n{'='*60}")
    print(f"TOP 50 DESCRIPCIONES MÁS FRECUENTES")
    print(f"{'='*60}")
    for desc, count in desc_counter.most_common(50):
        print(f"  [{count:4d}] {desc}")
    
    # Mostrar todas las descripciones únicas ordenadas alfabéticamente
    print(f"\n{'='*60}")
    print(f"TODAS LAS DESCRIPCIONES ÚNICAS (ordenadas alfabéticamente)")
    print(f"{'='*60}")
    for desc in sorted(set(descriptions)):
        count = desc_counter[desc]
        print(f"  [{count:4d}] {desc}")
    
    # Mostrar conceptos únicos
    print(f"\n{'='*60}")
    print(f"CONCEPTOS ÚNICOS")
    print(f"{'='*60}")
    for concept in sorted(set(concepts)):
        count = concept_counter[concept]
        print(f"  [{count:4d}] {concept}")
    
    # Guardar en archivo
    output_file = "descriptions-list.txt"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("=" * 60 + "\n")
        f.write("LISTADO DE DESCRIPCIONES\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"Total de transacciones: {len(descriptions)}\n")
        f.write(f"Descripciones únicas: {len(desc_counter)}\n\n")
        
        f.write("\n" + "=" * 60 + "\n")
        f.write("TOP 50 DESCRIPCIONES MÁS FRECUENTES\n")
        f.write("=" * 60 + "\n")
        for desc, count in desc_counter.most_common(50):
            f.write(f"  [{count:4d}] {desc}\n")
        
        f.write("\n" + "=" * 60 + "\n")
        f.write("TODAS LAS DESCRIPCIONES ÚNICAS\n")
        f.write("=" * 60 + "\n")
        for desc in sorted(set(descriptions)):
            count = desc_counter[desc]
            f.write(f"  [{count:4d}] {desc}\n")
        
        f.write("\n" + "=" * 60 + "\n")
        f.write("CONCEPTOS ÚNICOS\n")
        f.write("=" * 60 + "\n")
        for concept in sorted(set(concepts)):
            count = concept_counter[concept]
            f.write(f"  [{count:4d}] {concept}\n")
    
    print(f"\n✓ Listado guardado en: {output_file}")


if __name__ == "__main__":
    main()

