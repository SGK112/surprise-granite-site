#!/usr/bin/env python3
"""
Add country of origin data to slabs.json with flag emojis.
"""

import json
import re

# Country data with flag emojis
COUNTRIES = {
    'USA': {'name': 'USA', 'flag': '🇺🇸'},
    'Spain': {'name': 'Spain', 'flag': '🇪🇸'},
    'Israel': {'name': 'Israel', 'flag': '🇮🇱'},
    'South Korea': {'name': 'South Korea', 'flag': '🇰🇷'},
    'Italy': {'name': 'Italy', 'flag': '🇮🇹'},
    'Brazil': {'name': 'Brazil', 'flag': '🇧🇷'},
    'India': {'name': 'India', 'flag': '🇮🇳'},
    'China': {'name': 'China', 'flag': '🇨🇳'},
    'Turkey': {'name': 'Turkey', 'flag': '🇹🇷'},
    'Portugal': {'name': 'Portugal', 'flag': '🇵🇹'},
    'Norway': {'name': 'Norway', 'flag': '🇳🇴'},
    'Greece': {'name': 'Greece', 'flag': '🇬🇷'},
    'Vietnam': {'name': 'Vietnam', 'flag': '🇻🇳'},
    'Iran': {'name': 'Iran', 'flag': '🇮🇷'},
    'Egypt': {'name': 'Egypt', 'flag': '🇪🇬'},
    'South Africa': {'name': 'South Africa', 'flag': '🇿🇦'},
    'Canada': {'name': 'Canada', 'flag': '🇨🇦'},
    'Mexico': {'name': 'Mexico', 'flag': '🇲🇽'},
    'Australia': {'name': 'Australia', 'flag': '🇦🇺'},
    'Belgium': {'name': 'Belgium', 'flag': '🇧🇪'},
}

# Brand to country mapping (for manufactured quartz/engineered stone)
BRAND_ORIGINS = {
    'Cambria': 'USA',
    'Silestone': 'Spain',
    'Dekton': 'Spain',
    'Cosentino': 'Spain',
    'Caesarstone': 'Israel',
    'Radianz Quartz': 'South Korea',
    'Radianz': 'South Korea',
    'LX Hausys': 'South Korea',
    'Hanstone Quartz': 'South Korea',
    'Hanstone': 'South Korea',
    'Pentalquartz': 'USA',
    'Pental': 'USA',
    'MSI Surfaces': 'USA',
    'MSI': 'USA',
    'Arizona Tile': 'USA',
}

# Stone name patterns that indicate origin
STONE_NAME_ORIGINS = {
    # Italian marbles
    r'carrara': 'Italy',
    r'calacatta': 'Italy',
    r'statuario': 'Italy',
    r'arabescato': 'Italy',
    r'botticino': 'Italy',
    r'breccia': 'Italy',
    r'bardiglio': 'Italy',
    r'pietra\s*gray': 'Italy',

    # Brazilian stones
    r'taj\s*mahal': 'Brazil',
    r'super\s*white': 'Brazil',
    r'sea\s*pearl': 'Brazil',
    r'blue\s*bahia': 'Brazil',
    r'verde\s*peacock': 'Brazil',
    r'azul\s*macaubas': 'Brazil',
    r'fusion': 'Brazil',
    r'patagonia': 'Brazil',
    r'cristallo': 'Brazil',

    # Indian granites
    r'absolute\s*black': 'India',
    r'black\s*galaxy': 'India',
    r'tan\s*brown': 'India',
    r'kashmir\s*white': 'India',
    r'river\s*white': 'India',
    r'colonial\s*white': 'India',
    r'moon\s*white': 'India',
    r'new\s*venetian\s*gold': 'India',
    r'typhoon\s*bordeaux': 'India',

    # Spanish stones
    r'crema\s*marfil': 'Spain',
    r'emperador': 'Spain',
    r'negro\s*marquina': 'Spain',
    r'rojo\s*alicante': 'Spain',

    # Other origins
    r'azul\s*aran': 'Spain',
    r'labrador': 'Norway',
    r'blue\s*pearl': 'Norway',
    r'emerald\s*pearl': 'Norway',
    r'thassos': 'Greece',
    r'volakas': 'Greece',
    r'piracema': 'Brazil',
}

def extract_origin_from_description(description):
    """Extract country from description text like 'from India' or 'from Brazil'."""
    if not description:
        return None

    # Pattern to find "from [Country]"
    pattern = r'from\s+(India|Brazil|Italy|Spain|China|Turkey|USA|Portugal|Norway|Greece|Egypt|Iran|Vietnam|South\s*Africa|Canada|Mexico|Australia|Belgium)'
    match = re.search(pattern, description, re.IGNORECASE)
    if match:
        country = match.group(1).strip()
        # Normalize
        country = country.replace('  ', ' ').title()
        if country == 'South Africa':
            return 'South Africa'
        return country
    return None

def get_origin_from_stone_name(title):
    """Infer origin from stone name patterns."""
    if not title:
        return None

    title_lower = title.lower()
    for pattern, country in STONE_NAME_ORIGINS.items():
        if re.search(pattern, title_lower):
            return country
    return None

def get_origin(product):
    """Determine the origin of a product."""
    vendor = product.get('vendor', '')
    brand_display = product.get('brandDisplay', '')
    title = product.get('title', '')
    description = product.get('description', '')
    product_type = (product.get('productType', '') or '').lower()

    # For natural stones, check stone name patterns FIRST
    # This is more accurate than brand for Marble, Granite, Quartzite
    is_natural_stone = product_type in ['marble', 'granite', 'quartzite']

    if is_natural_stone:
        # 1. Check description for explicit origin
        desc_origin = extract_origin_from_description(description)
        if desc_origin:
            return desc_origin

        # 2. Infer from stone name (Carrara = Italy, etc.)
        name_origin = get_origin_from_stone_name(title)
        if name_origin:
            return name_origin

    # 3. Check brand mapping (for quartz/engineered stone or if natural stone has no match)
    for brand, country in BRAND_ORIGINS.items():
        if brand.lower() in vendor.lower() or brand.lower() in brand_display.lower():
            return country

    # 4. For other stones, still check description and name patterns
    if not is_natural_stone:
        desc_origin = extract_origin_from_description(description)
        if desc_origin:
            return desc_origin

        name_origin = get_origin_from_stone_name(title)
        if name_origin:
            return name_origin

    return None

def main():
    # Load slabs data
    with open('/Users/homepc/surprise-granite-site/data/slabs.json', 'r') as f:
        slabs = json.load(f)

    # Track statistics
    stats = {
        'total': len(slabs),
        'with_origin': 0,
        'by_country': {},
        'by_method': {'brand': 0, 'description': 0, 'name_pattern': 0}
    }

    # Add origin to each product
    for product in slabs:
        origin = get_origin(product)

        if origin and origin in COUNTRIES:
            product['originCountry'] = origin
            product['originFlag'] = COUNTRIES[origin]['flag']
            stats['with_origin'] += 1
            stats['by_country'][origin] = stats['by_country'].get(origin, 0) + 1
        else:
            # Remove any existing origin fields if we can't determine
            product.pop('originCountry', None)
            product.pop('originFlag', None)

    # Save updated data
    with open('/Users/homepc/surprise-granite-site/data/slabs.json', 'w') as f:
        json.dump(slabs, f, indent=2)

    # Print statistics
    print(f"Updated {stats['total']} products")
    print(f"Added origin to {stats['with_origin']} products ({stats['with_origin']*100//stats['total']}%)")
    print("\nBy country:")
    for country, count in sorted(stats['by_country'].items(), key=lambda x: -x[1]):
        flag = COUNTRIES.get(country, {}).get('flag', '')
        print(f"  {flag} {country}: {count}")

if __name__ == '__main__':
    main()
