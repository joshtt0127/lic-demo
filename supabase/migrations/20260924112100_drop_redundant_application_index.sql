-- Retrait d'un index redondant que je n'aurais pas dû ajouter.
--
-- `applications_role_id_talent_id_key` existe depuis l'origine : une seule
-- candidature par (rôle, comédien), sans exception. Je ne l'avais pas vue, et
-- j'ai ajouté un index partiel qui laissait repasser quelqu'un après un retrait.
-- Deux règles qui se recouvrent, dont une plus permissive, c'est la garantie
-- qu'on ne saura plus laquelle s'applique.
--
-- La contrainte d'origine reste, telle quelle. Elle est plus stricte que ce que
-- j'avais supposé, et c'est elle qui fait foi.
--
-- ⚠️ Décision produit à trancher, pas par une migration : **un comédien qui se
-- retire peut-il recandidater au même rôle ?** Aujourd'hui non, définitivement.
-- C'est défendable (on ne joue pas avec la liste d'une production) et c'est
-- dur (un désistement de bonne foi coûte le rôle pour toujours). Tant que LIC
-- n'a pas tranché, on garde le comportement existant.

drop index if exists public.applications_one_live_per_role;
