# Generated office assets

Generated with the built-in image_gen tool on 2026-10-29. Both outputs are copied into this project; no runtime image service, API key, or network request is needed.

- `office-cozy-v1.png`: 1536 × 1024, room background. Desk locations were inspected and mapped in `office-model.js`.
- `team-chibi-v1.png`: 1536 × 1024 RGBA atlas, 4 columns × 3 rows. Row-major order matches the ten existing roles, followed by PM, then an empty cell. Alpha transparency is preserved; cells are selected with CSS without modifying the generated image.

The user-provided screenshot was a visual reference for the cozy office style. The artwork contains no interface; interactive controls remain real HTML.

## Room generation prompt

Use case: stylized-concept. Asset type: production background for a fixed-camera 2.5D office simulation web extension, landscape 1536x1024.
Create a beautifully detailed cozy miniature IT office, orthographic cutaway view looking down at 45 degrees, centered symmetrical frontal composition, no camera roll. Warm light oak plank floor, cream walls, panoramic windows at back showing blue sky and a soft city skyline, lush plants along sill, small framed art and planning board, coffee nook at back right. Slight pixel-art / hand-painted simulation game aesthetic, crisp detailed furniture, soft daylight, cream, teal, navy and warm wood palette.
Critical layout for overlaying animated workers: ten single-person desks in exactly TWO horizontal rows of FIVE evenly spaced desks. Desk centers at x 18%,34%,50%,66%,82% of image. Back-row desk tops centered at y 43% and seats just below at y 49%. Front-row desk tops centered at y 68% and seats just below at y 75%. Each desk has a slim blue computer screen, keyboard, small notebook and navy chair facing the desk. Leave wide clear horizontal walking aisle between rows at y 58%, and clear floor in front at y 84%. A small cream sofa and yellow accent chair at bottom-left edge, low plant shelf bottom-right, do not obstruct desk rows. Whole room visible with clean outside dark navy matte background and minimal outer margin.
No people, no characters, no UI, no interface panels, no labels, no lettering, no speech bubbles, no watermarks. Furniture and architecture only. This is the actual environment asset, not a screenshot of an interface.

## Character generation prompt

Use case: stylized-concept. Asset type: transparent sprite atlas for a cozy 2.5D miniature office simulation.
Create ONE transparent PNG sprite sheet, exactly 4 columns by 3 rows of equally sized cells, landscape 1536x1024. Each cell contains one small full-body chibi office worker centered with generous transparent padding. Absolutely no lines, grid, background, lettering, props outside cell or drop shadows. Identical scale, head size and baseline per cell. View all characters from slightly above, three-quarter FRONT view, standing. Polished cozy hand-painted game art, crisp silhouette, large charming heads, short legs, detailed hair, tiny hands. NOT photoreal people.
Cell order left to right then top to bottom:
1 business analyst woman, dark bun, rose pink collared shirt.
2 system analyst man, short dark hair, glasses, blue shirt.
3 architect man, brown skin, yellow hardhat, ochre shirt.
4 designer woman, pink bob, purple beret and blouse.
5 developer man, spiky black hair, teal hoodie, headphones.
6 database admin man, brown curly hair, green beanie and shirt.
7 QA tester woman, brown ponytail, orange cap and shirt.
8 DevOps engineer man, dark brown skin, navy shirt, headset.
9 security engineer man, black hair, sunglasses, dark suit and red tie.
10 technical writer woman, long brown hair, cyan blouse, pencil behind ear.
11 project manager man, gray hair, glasses, navy suit, white shirt, carrying small ivory task clipboard.
12 leave completely empty and transparent.
Keep all bodies completely separated inside their own cells. Transparent alpha background. Workers only, no desk or chairs.
