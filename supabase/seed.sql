-- =============================================================================
-- Initial, editable portfolio content.
--
-- Contains ONLY information supplied by Joud. No projects, dates, employers,
-- certifications, links or contact details are invented here — add those
-- from the admin panel once verified.
--
-- Runs automatically on `supabase db reset` (local). For a hosted project,
-- run it once in the SQL editor after the migrations.
-- =============================================================================

update public.profile set
  intro = 'I build web applications across the stack — React and TypeScript interfaces, Laravel REST APIs and relational databases.',
  bio = 'I am a full-stack developer with a background in Business and Computer Science from the Lebanese University, Faculty of Technology in Saida, and full-stack web development training at Youbee.ai.

On the frontend I work with HTML, CSS, JavaScript, TypeScript, React and Angular, styling with Tailwind CSS and Bootstrap. On the backend I build REST APIs with PHP and Laravel, including authentication and authorization with Laravel Sanctum, backed by MySQL databases designed around clear relationships and migrations.',
  journey = 'My path into software started with Business and Computer Science studies at the Lebanese University. I then trained in full-stack web development at Youbee.ai, covering frontend interfaces, backend APIs and databases.

Alongside web development I have explored Flutter and Dart for mobile, as well as C, C# and Python.'
where id = 1;

insert into public.skill_categories (name, slug, sort_order) values
  ('Frontend Development',     'frontend',   1),
  ('Backend Development',      'backend',    2),
  ('Databases',                'databases',  3),
  ('Programming Languages',    'languages',  4),
  ('Frameworks and Libraries', 'frameworks', 5),
  ('Development Tools',        'tools',      6),
  ('Mobile Development',       'mobile',     7)
on conflict (slug) do nothing;

insert into public.skills (name, category_id, icon, proficiency_note, sort_order)
select s.name, c.id, s.icon, s.note, s.ord
from (values
  ('HTML5',                           'frontend',   'file-code',    null,       1),
  ('CSS3',                            'frontend',   'palette',      null,       2),
  ('Tailwind CSS',                    'frontend',   'palette',      null,       3),
  ('Bootstrap',                       'frontend',   'layout',       null,       4),
  ('REST API development',            'backend',    'server',       null,       1),
  ('Authentication and authorization','backend',    'shield',       null,       2),
  ('Laravel Sanctum',                 'backend',    'key',          null,       3),
  ('MySQL',                           'databases',  'database',     null,       1),
  ('SQL',                             'databases',  'database',     null,       2),
  ('Relational database design',      'databases',  'network',      null,       3),
  ('Migrations and relationships',    'databases',  'git-merge',    null,       4),
  ('JavaScript',                      'languages',  'braces',       null,       1),
  ('TypeScript',                      'languages',  'braces',       null,       2),
  ('PHP',                             'languages',  'code',         null,       3),
  ('Dart',                            'languages',  'code',         'Explored', 4),
  ('C',                               'languages',  'code',         'Explored', 5),
  ('C#',                              'languages',  'code',         'Explored', 6),
  ('Python',                          'languages',  'code',         'Explored', 7),
  ('React',                           'frameworks', 'atom',         null,       1),
  ('Angular',                         'frameworks', 'layers',       null,       2),
  ('Laravel',                         'frameworks', 'layers',       null,       3),
  ('Git',                             'tools',      'git-branch',   null,       1),
  ('GitHub',                          'tools',      'git-pull-request', null,   2),
  ('Node.js',                         'tools',      'terminal',     null,       3),
  ('npm',                             'tools',      'package',      null,       4),
  ('Composer',                        'tools',      'package',      null,       5),
  ('Visual Studio Code',              'tools',      'square-code',  null,       6),
  ('XAMPP',                           'tools',      'server',       null,       7),
  ('Flutter',                         'mobile',     'smartphone',   'Explored', 1)
) as s(name, cat, icon, note, ord)
join public.skill_categories c on c.slug = s.cat
on conflict do nothing;

insert into public.project_categories (name, slug, sort_order) values
  ('Web Application',    'web-application',    1),
  ('Mobile Application', 'mobile-application', 2),
  ('API & Backend',      'api-backend',        3)
on conflict (slug) do nothing;

-- Dates are left empty on purpose: add them from the admin panel.
insert into public.timeline_entries (kind, title, organization, location, sort_order) values
  ('education', 'Business and Computer Science', 'Lebanese University — Faculty of Technology', 'Saida, Lebanon', 1),
  ('training',  'Full Stack Web Development',    'Youbee.ai',                                   null,             1);
