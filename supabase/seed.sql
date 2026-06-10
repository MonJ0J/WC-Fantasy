-- =====================================================================
-- WC-Fantasy seed: 48 teams + all 104 matches (2026 FIFA World Cup)
-- Source: 2026 FIFA World Cup Wikipedia article (post final-draw Dec 5, 2025)
-- All kickoff times are stored in UTC; the literal timezone offset shown
-- here is the local time at the venue, which Postgres converts to UTC.
-- =====================================================================

-- ---------- TEAMS ----------
insert into teams (id, name, flag_emoji, group_letter, seed_position) values
  -- Group A
  ('MEX','Mexico',         E'\U0001F1F2\U0001F1FD','A',1),
  ('RSA','South Africa',   E'\U0001F1FF\U0001F1E6','A',2),
  ('KOR','South Korea',    E'\U0001F1F0\U0001F1F7','A',3),
  ('CZE','Czech Republic', E'\U0001F1E8\U0001F1FF','A',4),
  -- Group B
  ('CAN','Canada',                 E'\U0001F1E8\U0001F1E6','B',1),
  ('BIH','Bosnia and Herzegovina', E'\U0001F1E7\U0001F1E6','B',2),
  ('QAT','Qatar',                  E'\U0001F1F6\U0001F1E6','B',3),
  ('SUI','Switzerland',            E'\U0001F1E8\U0001F1ED','B',4),
  -- Group C
  ('BRA','Brazil',   E'\U0001F1E7\U0001F1F7','C',1),
  ('MAR','Morocco',  E'\U0001F1F2\U0001F1E6','C',2),
  ('HAI','Haiti',    E'\U0001F1ED\U0001F1F9','C',3),
  ('SCO','Scotland', E'\U0001F3F4\U000E0067\U000E0062\U000E0073\U000E0063\U000E0074\U000E007F','C',4),
  -- Group D
  ('USA','United States', E'\U0001F1FA\U0001F1F8','D',1),
  ('PAR','Paraguay',      E'\U0001F1F5\U0001F1FE','D',2),
  ('AUS','Australia',     E'\U0001F1E6\U0001F1FA','D',3),
  ('TUR','Türkiye',       E'\U0001F1F9\U0001F1F7','D',4),
  -- Group E
  ('GER','Germany',      E'\U0001F1E9\U0001F1EA','E',1),
  ('CUW','Curaçao',      E'\U0001F1E8\U0001F1FC','E',2),
  ('CIV','Côte d''Ivoire', E'\U0001F1E8\U0001F1EE','E',3),
  ('ECU','Ecuador',      E'\U0001F1EA\U0001F1E8','E',4),
  -- Group F
  ('NED','Netherlands', E'\U0001F1F3\U0001F1F1','F',1),
  ('JPN','Japan',       E'\U0001F1EF\U0001F1F5','F',2),
  ('SWE','Sweden',      E'\U0001F1F8\U0001F1EA','F',3),
  ('TUN','Tunisia',     E'\U0001F1F9\U0001F1F3','F',4),
  -- Group G
  ('BEL','Belgium',     E'\U0001F1E7\U0001F1EA','G',1),
  ('EGY','Egypt',       E'\U0001F1EA\U0001F1EC','G',2),
  ('IRN','IR Iran',     E'\U0001F1EE\U0001F1F7','G',3),
  ('NZL','New Zealand', E'\U0001F1F3\U0001F1FF','G',4),
  -- Group H
  ('ESP','Spain',        E'\U0001F1EA\U0001F1F8','H',1),
  ('CPV','Cabo Verde',   E'\U0001F1E8\U0001F1FB','H',2),
  ('KSA','Saudi Arabia', E'\U0001F1F8\U0001F1E6','H',3),
  ('URU','Uruguay',      E'\U0001F1FA\U0001F1FE','H',4),
  -- Group I
  ('FRA','France',  E'\U0001F1EB\U0001F1F7','I',1),
  ('SEN','Senegal', E'\U0001F1F8\U0001F1F3','I',2),
  ('IRQ','Iraq',    E'\U0001F1EE\U0001F1F6','I',3),
  ('NOR','Norway',  E'\U0001F1F3\U0001F1F4','I',4),
  -- Group J
  ('ARG','Argentina', E'\U0001F1E6\U0001F1F7','J',1),
  ('ALG','Algeria',   E'\U0001F1E9\U0001F1FF','J',2),
  ('AUT','Austria',   E'\U0001F1E6\U0001F1F9','J',3),
  ('JOR','Jordan',    E'\U0001F1EF\U0001F1F4','J',4),
  -- Group K
  ('POR','Portugal',   E'\U0001F1F5\U0001F1F9','K',1),
  ('COD','DR Congo',   E'\U0001F1E8\U0001F1E9','K',2),
  ('UZB','Uzbekistan', E'\U0001F1FA\U0001F1FF','K',3),
  ('COL','Colombia',   E'\U0001F1E8\U0001F1F4','K',4),
  -- Group L
  ('ENG','England', E'\U0001F3F4\U000E0067\U000E0062\U000E0065\U000E006E\U000E0067\U000E007F','L',1),
  ('CRO','Croatia', E'\U0001F1ED\U0001F1F7','L',2),
  ('GHA','Ghana',   E'\U0001F1EC\U0001F1ED','L',3),
  ('PAN','Panama',  E'\U0001F1F5\U0001F1E6','L',4)
on conflict (id) do nothing;

-- ---------- GROUP-STAGE MATCHES (1-72) ----------
insert into matches (id, stage, group_letter, home_team_id, away_team_id, kickoff_at, venue) values
  (1,  'GROUP','A','MEX','RSA','2026-06-11 13:00-06','Estadio Azteca, Mexico City'),
  (2,  'GROUP','A','KOR','CZE','2026-06-11 20:00-06','Estadio Akron, Zapopan'),
  (3,  'GROUP','B','CAN','BIH','2026-06-12 15:00-04','BMO Field, Toronto'),
  (4,  'GROUP','D','USA','PAR','2026-06-12 18:00-07','SoFi Stadium, Inglewood'),
  (5,  'GROUP','C','HAI','SCO','2026-06-13 21:00-04','Gillette Stadium, Foxborough'),
  (6,  'GROUP','D','AUS','TUR','2026-06-13 21:00-07','BC Place, Vancouver'),
  (7,  'GROUP','C','BRA','MAR','2026-06-13 18:00-04','MetLife Stadium, East Rutherford'),
  (8,  'GROUP','B','QAT','SUI','2026-06-13 12:00-07','Levi''s Stadium, Santa Clara'),
  (9,  'GROUP','E','CIV','ECU','2026-06-14 19:00-04','Lincoln Financial Field, Philadelphia'),
  (10, 'GROUP','E','GER','CUW','2026-06-14 12:00-05','NRG Stadium, Houston'),
  (11, 'GROUP','F','NED','JPN','2026-06-14 15:00-05','AT&T Stadium, Arlington'),
  (12, 'GROUP','F','SWE','TUN','2026-06-14 20:00-06','Estadio BBVA, Guadalupe'),
  (13, 'GROUP','H','KSA','URU','2026-06-15 18:00-04','Hard Rock Stadium, Miami Gardens'),
  (14, 'GROUP','H','ESP','CPV','2026-06-15 12:00-04','Mercedes-Benz Stadium, Atlanta'),
  (15, 'GROUP','G','IRN','NZL','2026-06-15 18:00-07','SoFi Stadium, Inglewood'),
  (16, 'GROUP','G','BEL','EGY','2026-06-15 12:00-07','Lumen Field, Seattle'),
  (17, 'GROUP','I','FRA','SEN','2026-06-16 15:00-04','MetLife Stadium, East Rutherford'),
  (18, 'GROUP','I','IRQ','NOR','2026-06-16 18:00-04','Gillette Stadium, Foxborough'),
  (19, 'GROUP','J','ARG','ALG','2026-06-16 20:00-05','Arrowhead Stadium, Kansas City'),
  (20, 'GROUP','J','AUT','JOR','2026-06-16 21:00-07','Levi''s Stadium, Santa Clara'),
  (21, 'GROUP','L','GHA','PAN','2026-06-17 19:00-04','BMO Field, Toronto'),
  (22, 'GROUP','L','ENG','CRO','2026-06-17 15:00-05','AT&T Stadium, Arlington'),
  (23, 'GROUP','K','POR','COD','2026-06-17 12:00-05','NRG Stadium, Houston'),
  (24, 'GROUP','K','UZB','COL','2026-06-17 20:00-06','Estadio Azteca, Mexico City'),
  (25, 'GROUP','A','CZE','RSA','2026-06-18 12:00-04','Mercedes-Benz Stadium, Atlanta'),
  (26, 'GROUP','B','SUI','BIH','2026-06-18 12:00-07','SoFi Stadium, Inglewood'),
  (27, 'GROUP','B','CAN','QAT','2026-06-18 15:00-07','BC Place, Vancouver'),
  (28, 'GROUP','A','MEX','KOR','2026-06-18 19:00-06','Estadio Akron, Zapopan'),
  (29, 'GROUP','C','BRA','HAI','2026-06-19 20:30-04','Lincoln Financial Field, Philadelphia'),
  (30, 'GROUP','C','SCO','MAR','2026-06-19 18:00-04','Gillette Stadium, Foxborough'),
  (31, 'GROUP','D','TUR','PAR','2026-06-19 20:00-07','Levi''s Stadium, Santa Clara'),
  (32, 'GROUP','D','USA','AUS','2026-06-19 12:00-07','Lumen Field, Seattle'),
  (33, 'GROUP','E','GER','CIV','2026-06-20 16:00-04','BMO Field, Toronto'),
  (34, 'GROUP','E','ECU','CUW','2026-06-20 19:00-05','Arrowhead Stadium, Kansas City'),
  (35, 'GROUP','F','NED','SWE','2026-06-20 12:00-05','NRG Stadium, Houston'),
  (36, 'GROUP','F','TUN','JPN','2026-06-20 22:00-06','Estadio BBVA, Guadalupe'),
  (37, 'GROUP','H','URU','CPV','2026-06-21 18:00-04','Hard Rock Stadium, Miami Gardens'),
  (38, 'GROUP','H','ESP','KSA','2026-06-21 12:00-04','Mercedes-Benz Stadium, Atlanta'),
  (39, 'GROUP','G','BEL','IRN','2026-06-21 12:00-07','SoFi Stadium, Inglewood'),
  (40, 'GROUP','G','NZL','EGY','2026-06-21 18:00-07','BC Place, Vancouver'),
  (41, 'GROUP','I','NOR','SEN','2026-06-22 20:00-04','MetLife Stadium, East Rutherford'),
  (42, 'GROUP','I','FRA','IRQ','2026-06-22 17:00-04','Lincoln Financial Field, Philadelphia'),
  (43, 'GROUP','J','ARG','AUT','2026-06-22 12:00-05','AT&T Stadium, Arlington'),
  (44, 'GROUP','J','JOR','ALG','2026-06-22 20:00-07','Levi''s Stadium, Santa Clara'),
  (45, 'GROUP','L','ENG','GHA','2026-06-23 16:00-04','Gillette Stadium, Foxborough'),
  (46, 'GROUP','L','PAN','CRO','2026-06-23 19:00-04','BMO Field, Toronto'),
  (47, 'GROUP','K','POR','UZB','2026-06-23 12:00-05','NRG Stadium, Houston'),
  (48, 'GROUP','K','COL','COD','2026-06-23 20:00-06','Estadio Akron, Zapopan'),
  (49, 'GROUP','C','SCO','BRA','2026-06-24 18:00-04','Hard Rock Stadium, Miami Gardens'),
  (50, 'GROUP','C','MAR','HAI','2026-06-24 18:00-04','Mercedes-Benz Stadium, Atlanta'),
  (51, 'GROUP','B','SUI','CAN','2026-06-24 12:00-07','BC Place, Vancouver'),
  (52, 'GROUP','B','BIH','QAT','2026-06-24 12:00-07','Lumen Field, Seattle'),
  (53, 'GROUP','A','CZE','MEX','2026-06-24 19:00-06','Estadio Azteca, Mexico City'),
  (54, 'GROUP','A','RSA','KOR','2026-06-24 19:00-06','Estadio BBVA, Guadalupe'),
  (55, 'GROUP','E','CUW','CIV','2026-06-25 16:00-04','Lincoln Financial Field, Philadelphia'),
  (56, 'GROUP','E','ECU','GER','2026-06-25 16:00-04','MetLife Stadium, East Rutherford'),
  (57, 'GROUP','F','JPN','SWE','2026-06-25 18:00-05','AT&T Stadium, Arlington'),
  (58, 'GROUP','F','TUN','NED','2026-06-25 18:00-05','Arrowhead Stadium, Kansas City'),
  (59, 'GROUP','D','TUR','USA','2026-06-25 19:00-07','SoFi Stadium, Inglewood'),
  (60, 'GROUP','D','PAR','AUS','2026-06-25 19:00-07','Levi''s Stadium, Santa Clara'),
  (61, 'GROUP','I','NOR','FRA','2026-06-26 15:00-04','Gillette Stadium, Foxborough'),
  (62, 'GROUP','I','SEN','IRQ','2026-06-26 15:00-04','BMO Field, Toronto'),
  (63, 'GROUP','G','EGY','IRN','2026-06-26 20:00-07','Lumen Field, Seattle'),
  (64, 'GROUP','G','NZL','BEL','2026-06-26 20:00-07','BC Place, Vancouver'),
  (65, 'GROUP','H','CPV','KSA','2026-06-26 19:00-05','NRG Stadium, Houston'),
  (66, 'GROUP','H','URU','ESP','2026-06-26 18:00-06','Estadio Akron, Zapopan'),
  (67, 'GROUP','L','PAN','ENG','2026-06-27 17:00-04','MetLife Stadium, East Rutherford'),
  (68, 'GROUP','L','CRO','GHA','2026-06-27 17:00-04','Lincoln Financial Field, Philadelphia'),
  (69, 'GROUP','J','ALG','AUT','2026-06-27 21:00-05','Arrowhead Stadium, Kansas City'),
  (70, 'GROUP','J','JOR','ARG','2026-06-27 21:00-05','AT&T Stadium, Arlington'),
  (71, 'GROUP','K','COL','POR','2026-06-27 19:30-04','Hard Rock Stadium, Miami Gardens'),
  (72, 'GROUP','K','COD','UZB','2026-06-27 19:30-04','Mercedes-Benz Stadium, Atlanta')
on conflict (id) do nothing;

-- ---------- KNOCKOUT MATCHES (73-104, teams populated later) ----------
insert into matches (id, stage, home_placeholder, away_placeholder, kickoff_at, venue, bracket_slot) values
  -- Round of 32
  (73, 'R32', 'Runner-up Group A', 'Runner-up Group B',     '2026-06-28 12:00-07','SoFi Stadium, Inglewood',73),
  (74, 'R32', 'Winner Group E',    '3rd Group A/B/C/D/F',   '2026-06-29 16:30-04','Gillette Stadium, Foxborough',74),
  (75, 'R32', 'Winner Group F',    'Runner-up Group C',     '2026-06-29 19:00-06','Estadio BBVA, Guadalupe',75),
  (76, 'R32', 'Winner Group C',    'Runner-up Group F',     '2026-06-29 12:00-05','NRG Stadium, Houston',76),
  (77, 'R32', 'Winner Group I',    '3rd Group C/D/F/G/H',   '2026-06-30 17:00-04','MetLife Stadium, East Rutherford',77),
  (78, 'R32', 'Runner-up Group E', 'Runner-up Group I',     '2026-06-30 12:00-05','AT&T Stadium, Arlington',78),
  (79, 'R32', 'Winner Group A',    '3rd Group C/E/F/H/I',   '2026-06-30 19:00-06','Estadio Azteca, Mexico City',79),
  (80, 'R32', 'Winner Group L',    '3rd Group E/H/I/J/K',   '2026-07-01 12:00-04','Mercedes-Benz Stadium, Atlanta',80),
  (81, 'R32', 'Winner Group D',    '3rd Group B/E/F/I/J',   '2026-07-01 17:00-07','Levi''s Stadium, Santa Clara',81),
  (82, 'R32', 'Winner Group G',    '3rd Group A/E/H/I/J',   '2026-07-01 13:00-07','Lumen Field, Seattle',82),
  (83, 'R32', 'Runner-up Group K', 'Runner-up Group L',     '2026-07-02 19:00-04','BMO Field, Toronto',83),
  (84, 'R32', 'Winner Group H',    'Runner-up Group J',     '2026-07-02 12:00-07','SoFi Stadium, Inglewood',84),
  (85, 'R32', 'Winner Group B',    '3rd Group E/F/G/I/J',   '2026-07-02 20:00-07','BC Place, Vancouver',85),
  (86, 'R32', 'Winner Group J',    'Runner-up Group H',     '2026-07-03 18:00-04','Hard Rock Stadium, Miami Gardens',86),
  (87, 'R32', 'Winner Group K',    '3rd Group D/E/I/J/L',   '2026-07-03 20:30-05','Arrowhead Stadium, Kansas City',87),
  (88, 'R32', 'Runner-up Group D', 'Runner-up Group G',     '2026-07-03 13:00-05','AT&T Stadium, Arlington',88),
  -- Round of 16
  (89, 'R16', 'Winner Match 74', 'Winner Match 77', '2026-07-04 17:00-04','Lincoln Financial Field, Philadelphia',89),
  (90, 'R16', 'Winner Match 73', 'Winner Match 75', '2026-07-04 12:00-05','NRG Stadium, Houston',90),
  (91, 'R16', 'Winner Match 76', 'Winner Match 78', '2026-07-05 16:00-04','MetLife Stadium, East Rutherford',91),
  (92, 'R16', 'Winner Match 79', 'Winner Match 80', '2026-07-05 18:00-06','Estadio Azteca, Mexico City',92),
  (93, 'R16', 'Winner Match 83', 'Winner Match 84', '2026-07-06 14:00-05','AT&T Stadium, Arlington',93),
  (94, 'R16', 'Winner Match 81', 'Winner Match 82', '2026-07-06 17:00-07','Lumen Field, Seattle',94),
  (95, 'R16', 'Winner Match 86', 'Winner Match 88', '2026-07-07 12:00-04','Mercedes-Benz Stadium, Atlanta',95),
  (96, 'R16', 'Winner Match 85', 'Winner Match 87', '2026-07-07 13:00-07','BC Place, Vancouver',96),
  -- Quarterfinals
  (97,  'QF', 'Winner Match 89', 'Winner Match 90',  '2026-07-09 16:00-04','Gillette Stadium, Foxborough',97),
  (98,  'QF', 'Winner Match 93', 'Winner Match 94',  '2026-07-10 12:00-07','SoFi Stadium, Inglewood',98),
  (99,  'QF', 'Winner Match 91', 'Winner Match 92',  '2026-07-11 17:00-04','Hard Rock Stadium, Miami Gardens',99),
  (100, 'QF', 'Winner Match 95', 'Winner Match 96',  '2026-07-11 20:00-05','Arrowhead Stadium, Kansas City',100),
  -- Semifinals
  (101, 'SF', 'Winner Match 97', 'Winner Match 98',  '2026-07-14 14:00-05','AT&T Stadium, Arlington',101),
  (102, 'SF', 'Winner Match 99', 'Winner Match 100', '2026-07-15 15:00-04','Mercedes-Benz Stadium, Atlanta',102),
  -- Third place + Final
  (103, 'THIRD', 'Loser Match 101',  'Loser Match 102',  '2026-07-18 17:00-04','Hard Rock Stadium, Miami Gardens',103),
  (104, 'FINAL', 'Winner Match 101', 'Winner Match 102', '2026-07-19 15:00-04','MetLife Stadium, East Rutherford',104)
on conflict (id) do nothing;
