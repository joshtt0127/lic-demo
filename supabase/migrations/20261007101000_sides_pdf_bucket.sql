-- Audition Sides™ — 2/2 : le bucket public `media` accepte les PDF.
--
-- Les sides sont lisibles de qui voit l'annonce, comme l'affiche : un comédien
-- qui hésite doit pouvoir lire la scène avant de candidater. La limite côté
-- écran (20 MB, `RULES.sides` dans src/lib/storage.ts) reste sous celle du bucket.

update storage.buckets
   set allowed_mime_types = array[
     'image/jpeg', 'image/png', 'image/webp', 'image/avif',
     'video/mp4', 'video/quicktime', 'video/webm',
     'application/pdf'
   ]
 where id = 'media';
