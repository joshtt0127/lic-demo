import { useState } from 'react'
import { FormField, Input, SelectInput } from '@/components/ui'

/**
 * Country picker. A select matches the design and covers the industry's main
 * markets; "Other" falls back to a free text field so nobody is locked out by
 * a short list.
 */
const COUNTRIES = [
  'United States',
  'United Kingdom',
  'France',
  'Canada',
  'Australia',
  'Germany',
  'Spain',
  'Italy',
  'Belgium',
  'Netherlands',
  'Ireland',
  'Portugal',
  'Switzerland',
  'Austria',
  'Sweden',
  'Denmark',
  'Norway',
  'Finland',
  'Poland',
  'Czechia',
  'Hungary',
  'Romania',
  'Greece',
  'Israel',
  'United Arab Emirates',
  'Morocco',
  'South Africa',
  'Nigeria',
  'Kenya',
  'Egypt',
  'India',
  'Japan',
  'South Korea',
  'China',
  'Singapore',
  'New Zealand',
  'Mexico',
  'Brazil',
  'Argentina',
  'Colombia',
  'Chile',
]

const OTHER = '__other__'

export function CountryField({
  value,
  onChange,
  label = 'Country',
  optional,
}: {
  value: string
  onChange: (value: string) => void
  label?: string
  optional?: boolean
}) {
  const known = value === '' || COUNTRIES.includes(value)
  const [freeText, setFreeText] = useState(!known)

  if (freeText) {
    return (
      <FormField label={label} plainLabel optional={optional}>
        <Input
          fieldSize="lg"
          placeholder="Your country"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            if (!value.trim()) setFreeText(false)
          }}
          autoFocus
        />
      </FormField>
    )
  }

  return (
    <FormField label={label} plainLabel optional={optional}>
      <SelectInput
        fieldSize="lg"
        value={known ? value : ''}
        onChange={(event) => {
          if (event.target.value === OTHER) {
            onChange('')
            setFreeText(true)
            return
          }
          onChange(event.target.value)
        }}
      >
        <option value="">Select a country</option>
        {COUNTRIES.map((country) => (
          <option key={country} value={country}>
            {country}
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </SelectInput>
    </FormField>
  )
}
