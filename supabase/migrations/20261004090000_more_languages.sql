-- Plus de langues au catalogue (retour de test : « pas assez de langues »).
--
-- Le catalogue alimente l'autocomplétion des critères de rôle et du profil
-- talent. On ajoute les langues parlées courantes manquantes, les créoles et
-- les langues des signes — des compétences que le casting cherche réellement.

insert into public.languages (code, name) values
  ('af', 'Afrikaans'), ('sq', 'Albanian'), ('am', 'Amharic'), ('hy', 'Armenian'),
  ('az', 'Azerbaijani'), ('be', 'Belarusian'), ('bs', 'Bosnian'), ('br', 'Breton'),
  ('bg', 'Bulgarian'), ('my', 'Burmese'), ('co', 'Corsican'), ('hr', 'Croatian'),
  ('et', 'Estonian'), ('gl', 'Galician'), ('ka', 'Georgian'), ('gu', 'Gujarati'),
  ('ht', 'Haitian Creole'), ('ha', 'Hausa'), ('is', 'Icelandic'), ('ig', 'Igbo'),
  ('kn', 'Kannada'), ('kk', 'Kazakh'), ('km', 'Khmer'), ('rw', 'Kinyarwanda'),
  ('ku', 'Kurdish'), ('lo', 'Lao'), ('la', 'Latin'), ('lv', 'Latvian'),
  ('ln', 'Lingala'), ('lt', 'Lithuanian'), ('lb', 'Luxembourgish'), ('mk', 'Macedonian'),
  ('mg', 'Malagasy'), ('ms', 'Malay'), ('ml', 'Malayalam'), ('mt', 'Maltese'),
  ('mr', 'Marathi'), ('mn', 'Mongolian'), ('ne', 'Nepali'), ('oc', 'Occitan'),
  ('ps', 'Pashto'), ('pa', 'Punjabi'), ('gd', 'Scottish Gaelic'), ('sr', 'Serbian'),
  ('si', 'Sinhala'), ('sk', 'Slovak'), ('sl', 'Slovenian'), ('so', 'Somali'),
  ('te', 'Telugu'), ('bo', 'Tibetan'), ('ti', 'Tigrinya'), ('uz', 'Uzbek'),
  ('cy', 'Welsh'), ('wo', 'Wolof'), ('xh', 'Xhosa'), ('zu', 'Zulu'),
  ('gcf', 'Antillean Creole'), ('rcf', 'Réunion Creole'),
  ('ase', 'American Sign Language'), ('bfi', 'British Sign Language'),
  ('fsl', 'French Sign Language')
on conflict (code) do nothing;
