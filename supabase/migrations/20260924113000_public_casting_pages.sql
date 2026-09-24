-- Un casting public se lit sans compte.
--
-- Le lien partagé sur LinkedIn ou dans un groupe WhatsApp tombait jusqu'ici sur
-- un mur de connexion. Pour une place de marché qui vit de ses annonces, c'est
-- le contraire du but : on perd le partage, la découverte et le référencement,
-- et on demande à quelqu'un de créer un compte pour savoir **si** l'annonce
-- l'intéresse.
--
-- Ce qui devient lisible sans compte : le casting publié, ses rôles, le projet
-- qui le porte et l'organisation qui le publie. Rien d'autre. Les candidatures,
-- les tapes, les notes, les votes et les profils de comédiens restent
-- exactement où ils étaient.
--
-- Et une troisième visibilité apparaît, `private_link` : l'annonce est
-- accessible à qui a l'adresse, mais **n'est listée nulle part**. C'est le
-- casting confidentiel, celui qu'on envoie à trois agents sans l'afficher au
-- monde. L'exclusion des listes se fait dans les requêtes de liste, pas dans la
-- policy : une policy ne sait pas distinguer « on m'a donné l'URL » de « je
-- parcours le catalogue ».
--
-- `invite_only` est ajouté à l'énumération mais **n'ouvre encore rien** : il
-- demande une table d'invitations de comédiens et son écran, qui viendront
-- avec leur propre migration. Une valeur d'enum déclarée et non traitée se
-- comporte ici comme le cas le plus fermé — personne ne voit l'annonce hors de
-- l'organisation — ce qui est le bon défaut.

alter type public.casting_visibility add value if not exists 'private_link';
alter type public.casting_visibility add value if not exists 'invite_only';
