import { describe, expect, test } from "bun:test"

// Import the functions we want to test
import { extractImports, validateImports } from "../codingAgent"

describe("extractImports", () => {
  test("should extract single import", () => {
    const code = `import { someFunc } from "lodash"`
    const result = extractImports(code)
    expect(result).toEqual(["lodash"])
  })

  test("should extract multiple imports", () => {
    const code = `
      import { someFunc } from "lodash"
      import axios from "axios"
      import { Buffer } from "buffer"
    `
    const result = extractImports(code)
    expect(result).toEqual(["lodash", "axios", "buffer"])
  })

  test("should handle scoped packages", () => {
    const code = `
      import { something } from "@types/node"
      import { Component } from "@angular/core"
    `
    const result = extractImports(code)
    expect(result).toEqual(["@types/node", "@angular/core"])
  })

  test("should ignore relative imports", () => {
    const code = `
      import { localFunc } from "./local"
      import { parentFunc } from "../parent"
      import { rootFunc } from "/root"
      import { npmPkg } from "npm-package"
    `
    const result = extractImports(code)
    expect(result).toEqual(["npm-package"])
  })

  test("should extract package name from submodules", () => {
    const code = `
      import { func } from "lodash/isEqual"
      import { something } from "rxjs/operators"
    `
    const result = extractImports(code)
    expect(result).toEqual(["lodash", "rxjs"])
  })

  test("should remove duplicates", () => {
    const code = `
      import { func1 } from "lodash"
      import { func2 } from "lodash/isEqual"
      import { func3 } from "lodash/merge"
    `
    const result = extractImports(code)
    expect(result).toEqual(["lodash"])
  })

  test("should handle different quote styles", () => {
    const code = `
      import { func1 } from 'single-quotes'
      import { func2 } from "double-quotes"
    `
    const result = extractImports(code)
    expect(result).toEqual(["single-quotes", "double-quotes"])
  })

  test("should handle empty code", () => {
    const code = ""
    const result = extractImports(code)
    expect(result).toEqual([])
  })
})

describe("validateImports", () => {
  test("should pass validation when all imports are allowed", () => {
    const code = `
      import { someFunc } from "lodash"
      import axios from "axios"
    `
    const allowedPackages = [
      { name: "lodash", version: "4.17.21" },
      { name: "axios", version: "1.0.0" },
    ]
    const result = validateImports(code, allowedPackages)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  test("should fail validation when imports are not allowed", () => {
    const code = `
      import { someFunc } from "lodash"
      import axios from "axios"
      import fs from "fs"
    `
    const allowedPackages = [{ name: "lodash", version: "4.17.21" }]
    const result = validateImports(code, allowedPackages)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      "Import 'axios' is not in the packages list. Add it to packages or remove the import.",
      "Import 'fs' is not in the packages list. Add it to packages or remove the import.",
    ])
  })

  test("should ignore relative imports in validation", () => {
    const code = `
      import { localFunc } from "./local"
      import { npmPkg } from "lodash"
    `
    const allowedPackages = [{ name: "lodash", version: "4.17.21" }]
    const result = validateImports(code, allowedPackages)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  test("should handle scoped packages in validation", () => {
    const code = `
      import { types } from "@types/node"
    `
    const allowedPackages = [{ name: "@types/node", version: "18.0.0" }]
    const result = validateImports(code, allowedPackages)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  test("should handle empty packages list", () => {
    const code = `
      import { someFunc } from "lodash"
    `
    const allowedPackages: { name: string; version: string }[] = []
    const result = validateImports(code, allowedPackages)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      "Import 'lodash' is not in the packages list. Add it to packages or remove the import.",
    ])
  })

  test("should handle code with no imports", () => {
    const code = `
      export default () => {
        console.log("Hello world")
        return "success"
      }
    `
    const allowedPackages: { name: string; version: string }[] = []
    const result = validateImports(code, allowedPackages)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })
})

describe("Integration tests", () => {
  test("should validate code with proper packages", () => {
    const code = `
      import axios from "axios"
      import { isEqual } from "lodash"
      
      export default async () => {
        const response = await axios.get("https://api.example.com")
        return isEqual(response.data, {})
      }
    `
    const packages = [
      { name: "axios", version: "1.0.0" },
      { name: "lodash", version: "4.17.21" },
    ]
    const result = validateImports(code, packages)
    expect(result.valid).toBe(true)
  })

  test("should reject code with missing packages", () => {
    const code = `
      import axios from "axios"
      import { parse } from "yaml"
      
      export default () => {
        return parse("key: value")
      }
    `
    const packages = [{ name: "axios", version: "1.0.0" }]
    const result = validateImports(code, packages)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      "Import 'yaml' is not in the packages list. Add it to packages or remove the import.",
    )
  })

  test("should handle complex import patterns", () => {
    const code = `
      import { Calendar } from "@google-cloud/calendar"
      import moment from "moment"
      import fs from "fs"
      import path from "path"
      import { config } from "./config"
      
      export default async () => {
        const calendarService = new Calendar()
        const now = moment().format()
        return { now, service: calendarService }
      }
    `
    const packages = [
      { name: "@google-cloud/calendar", version: "3.0.0" },
      { name: "moment", version: "2.29.0" },
    ]
    const result = validateImports(code, packages)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      "Import 'fs' is not in the packages list. Add it to packages or remove the import.",
      "Import 'path' is not in the packages list. Add it to packages or remove the import.",
    ])
  })
})
