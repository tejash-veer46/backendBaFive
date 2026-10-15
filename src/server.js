import 'dotenv/config'
import { app } from './app.js'
import { seedDemo } from './demo.js'

seedDemo()

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`🚀 baFive API running on http://localhost:${PORT}`)
})
