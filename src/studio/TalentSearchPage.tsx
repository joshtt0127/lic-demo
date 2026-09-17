import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MapPin, Search, Users } from 'lucide-react'
import { Avatar, Card, FormError, Input, SelectInput, Tag } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useTalentSearch } from '@/features/studio/queries'
import { useLanguagesCatalog, useSkillsCatalog } from '@/features/talent/queries'
import { errorMessage } from '@/lib/supabase'

/** Talent search over the real profiles of the platform. */
export function TalentSearchPage() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [city, setCity] = useState('')
  const [gender, setGender] = useState('')
  const [playingAge, setPlayingAge] = useState('')
  const [skill, setSkill] = useState('')
  const [language, setLanguage] = useState('')

  const skills = useSkillsCatalog()
  const languages = useLanguagesCatalog()

  const results = useTalentSearch({
    query,
    city,
    gender: gender || null,
    playingAge: playingAge ? Number(playingAge) : null,
    skill: skill || null,
    language: language || null,
  })

  function updateQuery(value: string) {
    setQuery(value)
    const next = new URLSearchParams(params)
    if (value.trim()) next.set('q', value)
    else next.delete('q')
    setParams(next, { replace: true })
  }

  const count = results.data?.length ?? 0

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
      <header>
        <h1 className="font-display text-[1.7rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[2.1rem]">
          Talent
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          {results.isLoading
            ? 'Searching…'
            : `${count} talent${count === 1 ? '' : 's'} match your criteria`}
        </p>
      </header>

      <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input
          icon={<Search className="h-4 w-4" />}
          placeholder="Name, headline, skill…"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
        />
        <Input
          icon={<MapPin className="h-4 w-4" />}
          placeholder="City"
          value={city}
          onChange={(event) => setCity(event.target.value)}
        />
        <SelectInput value={gender} onChange={(event) => setGender(event.target.value)}>
          <option value="">Any gender</option>
          <option value="Female">Female</option>
          <option value="Male">Male</option>
          <option value="Non-binary">Non-binary</option>
        </SelectInput>
        <Input
          type="number"
          min={0}
          max={120}
          placeholder="Plays this age"
          value={playingAge}
          onChange={(event) => setPlayingAge(event.target.value)}
        />
        <SelectInput value={skill} onChange={(event) => setSkill(event.target.value)}>
          <option value="">Any skill</option>
          {(skills.data ?? []).map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="">Any language</option>
          {(languages.data ?? []).map((item) => (
            <option key={item.code} value={item.name}>
              {item.name}
            </option>
          ))}
        </SelectInput>
      </Card>

      {results.error && (
        <FormError>{errorMessage(results.error, 'Could not search talents')}</FormError>
      )}

      {results.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : count === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No talent matches"
          description="Loosen a filter — or invite the talent you are looking for to join Let It Cast."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(results.data ?? []).map((talent) => (
            <li key={talent.profileId}>
              <Link to={`/studio/talent/${talent.profileId}`}>
                <Card interactive className="flex h-full flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar src={talent.avatarUrl ?? undefined} name={talent.name} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-display text-[16px] font-bold text-ink">
                        {talent.name}
                      </p>
                      <p className="truncate text-[13px] text-muted">
                        {talent.headline ?? 'Talent'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                    {talent.city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {talent.city}
                      </span>
                    )}
                    {talent.playingAgeMin !== null && talent.playingAgeMax !== null && (
                      <span>
                        Plays {talent.playingAgeMin}–{talent.playingAgeMax}
                      </span>
                    )}
                    {talent.experienceLevel && <span>{talent.experienceLevel}</span>}
                  </div>

                  {talent.skills.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-1.5">
                      {talent.skills.slice(0, 4).map((item) => (
                        <Tag key={item}>{item}</Tag>
                      ))}
                    </div>
                  )}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
