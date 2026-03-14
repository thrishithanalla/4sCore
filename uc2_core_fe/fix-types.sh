#!/bin/bash
echo "Fixing TypeScript errors..."

# Fix personnel-form.tsx - ensure value prop defaults to empty string
sed -i 's/value={field.value}/value={field.value || ""}/g' src/pages/personnel/personnel-form.tsx

# Fix unit-villages view - remove unused import
sed -i 's/, User//g' src/pages/unit-villages/unit-village-view.tsx

# Fix unit-form.tsx - remove unused setError
sed -i '/const \[error, setError\] = useState/d' src/pages/units/unit-form.tsx
sed -i 's/const \[error, setError\]/const \[error\]/g' src/pages/units/unit-form.tsx

echo "Done fixing errors"
