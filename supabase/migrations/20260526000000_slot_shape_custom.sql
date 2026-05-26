-- Shape system overhaul: rect+corner_radius, circle, custom(SVG path), banner, backdrop.
-- Drops 'rounded' (→ rect with corner_radius=14) and 'hex' (→ custom with hex path).

alter table overlay_elements
  add column if not exists corner_radius integer not null default 0
    check (corner_radius >= 0 and corner_radius <= 100),
  add column if not exists clip_path_svg text;

-- Migrate rounded → rect + corner_radius=14
update overlay_elements set shape = 'rect', corner_radius = 14 where shape = 'rounded';

-- Migrate hex → custom + hexagon SVG path (objectBoundingBox 0-1 coords)
update overlay_elements
  set shape = 'custom',
      clip_path_svg = 'M 0.25 0 L 0.75 0 L 1 0.5 L 0.75 1 L 0.25 1 L 0 0.5 Z'
  where shape = 'hex';

alter table overlay_elements
  drop constraint if exists overlay_elements_shape_check;

alter table overlay_elements
  add constraint overlay_elements_shape_check
  check (shape in ('rect','circle','banner','backdrop','custom'));
