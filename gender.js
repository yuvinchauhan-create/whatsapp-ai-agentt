// gender.js — Accurate Indian Name Gender Classifier & Salutation Generator

const FEMALE_NAMES = new Set([
  'pooja', 'puja', 'priya', 'neha', 'aarti', 'arti', 'preeti', 'priti', 'pinky', 'jyoti', 
  'anjali', 'archana', 'sunita', 'anita', 'reena', 'sheena', 'shabnam', 'daxa', 'amisha', 
  'kalpana', 'sapna', 'radha', 'divya', 'deepika', 'ritu', 'sneha', 'richa', 'shweta', 
  'nisha', 'priyanka', 'megha', 'tanu', 'mansi', 'riddhi', 'siddhi', 'payal', 'sonam', 
  'kajal', 'suman', 'sushma', 'geeta', 'gita', 'seema', 'sima', 'rekha', 'poonam', 'monika', 
  'vandana', 'savita', 'mamta', 'babita', 'sarita', 'sangeeta', 'sangita', 'chanda', 'laxmi', 
  'sakshi', 'khushi', 'muskan', 'kavita', 'shikha', 'pavitra', 'mona', 'sonia', 'sonya',
  'simran', 'harpreet', 'gurpreet', 'jaspreet', 'manpreet', 'navneet', 'kiran', 'leena',
  'tabassum', 'diana', 'amisha', 'jyoti', 'kirti', 'kriti', 'chahat', 'nisha', 'tina',
  'taniya', 'tanya', 'ishita', 'ananya', 'anushka', 'bhavna', 'namrata', 'rashmi', 'pinkal'
]);

const MALE_NAMES = new Set([
  'rahul', 'rohit', 'amit', 'sumit', 'vikas', 'vikram', 'sachin', 'deepak', 'pankaj',
  'sanjay', 'vicky', 'arun', 'varun', 'tarun', 'karan', 'arjun', 'raj', 'raja', 'rajesh',
  'mukesh', 'dinesh', 'ramesh', 'suresh', 'mahesh', 'naresh', 'yogesh', 'lokesh', 'hitesh',
  'prashant', 'praveen', 'pradeep', 'manish', 'ashish', 'nitesh', 'ritik', 'yuvraj', 'yuvin',
  'ajay', 'vijay', 'sanjay', 'suraj', 'pawan', 'naveen', 'gaurav', 'sourabh', 'saurabh',
  'shivam', 'shubham', 'gautam', 'vishal', 'vivek', 'vinay', 'vineet', 'vinit', 'mohit',
  'ankit', 'aman', 'abhishek', 'akash', 'aditya', 'ayush', 'yash', 'harsh', 'sahil'
]);

function detectGender(fullName = '') {
  if (!fullName || typeof fullName !== 'string') return 'unknown';

  const cleanName = fullName.toLowerCase().trim();
  const firstName = cleanName.split(/\s+/)[0];

  // 1. Direct Set match
  if (FEMALE_NAMES.has(firstName) || FEMALE_NAMES.has(cleanName)) return 'female';
  if (MALE_NAMES.has(firstName) || MALE_NAMES.has(cleanName)) return 'male';

  // 2. Common female title words
  if (cleanName.includes('mrs') || cleanName.includes('miss') || cleanName.includes('kaur') || cleanName.includes('kumari') || cleanName.includes('devi')) {
    return 'female';
  }
  if (cleanName.includes('mr') || cleanName.includes('singh') || cleanName.includes('kumar') || cleanName.includes('bhai')) {
    return 'male';
  }

  // 3. Phonetic ending heuristics for Indian names
  if (firstName.endsWith('a') && !['rahul', 'krishna', 'siva', 'shiva', 'murli', 'dharma'].includes(firstName)) {
    return 'female';
  }
  if (firstName.endsWith('i') || firstName.endsWith('ee')) {
    return 'female';
  }

  return 'unknown';
}

function getRespectfulSalutation(gender, name = '') {
  const cleanName = name && name !== 'Lead' ? name : '';
  
  if (gender === 'female') {
    return cleanName ? `${cleanName} ji` : 'Mam';
  } else if (gender === 'male') {
    return cleanName ? `${cleanName} bhai` : 'Bhai';
  } else {
    return cleanName ? `${cleanName} ji` : 'Dear';
  }
}

module.exports = {
  detectGender,
  getRespectfulSalutation
};
