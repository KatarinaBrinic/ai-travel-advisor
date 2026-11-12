import 'dotenv/config';
import { app } from './app.ts';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
